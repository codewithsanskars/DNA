import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { userRepository } from '../repositories/user.repository';
import { oktaService } from '../services/okta.service';
import { env } from '../config/env';

// Short-lived, httpOnly — only ever read back on the matching /okta/callback
// request, scoped narrowly so they aren't sent on unrelated API calls.
const OKTA_COOKIE_OPTS = {
  httpOnly: true,
  secure: env.nodeEnv === 'production',
  sameSite: 'lax' as const,
  maxAge: 10 * 60 * 1000,
  path: '/api/auth/okta',
};

function clearOktaCookies(res: Response) {
  res.clearCookie('okta_state', { path: '/api/auth/okta' });
  res.clearCookie('okta_verifier', { path: '/api/auth/okta' });
}

function redirectToLoginError(res: Response, code: string) {
  res.redirect(`${env.frontendUrl}/login?error=${encodeURIComponent(code)}`);
}

export const authController = {
  // Lets the login page decide whether to show the "Continue with Okta SSO"
  // button at all, instead of bouncing the user through a redirect that's
  // just going to come straight back with an "not configured" error.
  oktaStatus: (_req: Request, res: Response) => {
    res.json({ success: true, data: { configured: oktaService.isConfigured() } });
  },

  login: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body;
      if (!email) {
        res.status(400).json({ success: false, error: 'Email is required' });
        return;
      }
      const result = await authService.loginByEmail(email);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // Starts the Okta Authorization Code + PKCE flow: stash a CSRF state value
  // and the PKCE verifier in short-lived cookies, then send the browser to
  // Okta's real /authorize endpoint.
  oktaLogin: (req: Request, res: Response) => {
    if (!oktaService.isConfigured()) {
      redirectToLoginError(res, 'okta_not_configured');
      return;
    }
    const state = oktaService.generateState();
    const { codeVerifier, codeChallenge } = oktaService.generatePkce();
    res.cookie('okta_state', state, OKTA_COOKIE_OPTS);
    res.cookie('okta_verifier', codeVerifier, OKTA_COOKIE_OPTS);
    res.redirect(oktaService.buildAuthorizeUrl(state, codeChallenge));
  },

  // Okta redirects back here with ?code&state (or ?error on cancel/denial).
  // Exchanges the code for tokens, verifies the ID token, and logs the user
  // into the portal exactly like the email-login path does from there.
  oktaCallback: async (req: Request, res: Response) => {
    try {
      const { code, state, error: oktaError } = req.query as Record<string, string | undefined>;
      if (oktaError) {
        clearOktaCookies(res);
        redirectToLoginError(res, oktaError);
        return;
      }

      const savedState = req.cookies?.okta_state;
      const codeVerifier = req.cookies?.okta_verifier;
      clearOktaCookies(res);

      if (!code || !state || !savedState || state !== savedState || !codeVerifier) {
        redirectToLoginError(res, 'okta_state_mismatch');
        return;
      }

      const { idToken } = await oktaService.exchangeCode(code, codeVerifier);
      const profile = await oktaService.verifyIdToken(idToken);
      const result = await authService.handleOktaCallback(profile);

      if (result.status === 'register') {
        const params = new URLSearchParams({
          register: '1',
          pendingToken: result.pendingToken,
          email: result.email,
          name: result.name,
        });
        res.redirect(`${env.frontendUrl}/auth/callback?${params.toString()}`);
        return;
      }

      res.redirect(`${env.frontendUrl}/auth/callback?token=${result.token}`);
    } catch (err) {
      console.error('[Okta] callback failed:', (err as Error).message);
      redirectToLoginError(res, 'okta_failed');
    }
  },

  // Submitted by the "which organization are you with?" modal shown after a
  // first-time Okta sign-in — creates the account and its CLIENT membership.
  // Handled here instead of via next(err) so a thrown validation message
  // (expired token, blank org name) surfaces as a 400, not the generic
  // error handler's default 500.
  completeOktaRegistration: async (req: Request, res: Response) => {
    try {
      const { pendingToken, organizationName } = req.body;
      if (!pendingToken || !organizationName) {
        res.status(400).json({ success: false, error: 'pendingToken and organizationName are required' });
        return;
      }
      const result = await authService.completeOktaRegistration(pendingToken, organizationName);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, error: (err as Error).message });
    }
  },

  me: async (req: any, res: Response, next: NextFunction) => {
    try {
      const user = await userRepository.findById(req.user.userId);
      res.json({
        success: true,
        data: { ...req.user, name: user?.name, email: user?.email, avatarUrl: user?.avatarUrl ?? null },
      });
    } catch (err) {
      next(err);
    }
  },

  // Self-service profile edit — name/email only. Email here is purely a
  // portal contact field, decoupled from Okta identity/login, so changing it
  // doesn't touch `oktaId` or require re-verification.
  updateMe: async (req: any, res: Response, next: NextFunction) => {
    try {
      const { name, email } = req.body;
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName) {
        res.status(400).json({ success: false, error: 'Name is required' });
        return;
      }
      const normalizedEmail = typeof email === 'string' ? email.toLowerCase().trim() : '';
      if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        res.status(400).json({ success: false, error: 'A valid email is required' });
        return;
      }

      const existing = await userRepository.findByEmail(normalizedEmail);
      if (existing && existing.id !== req.user.userId) {
        res.status(409).json({ success: false, error: 'That email is already in use' });
        return;
      }

      const updated = await userRepository.update(req.user.userId, {
        name: trimmedName,
        email: normalizedEmail,
      });
      res.json({
        success: true,
        data: { ...req.user, name: updated?.name, email: updated?.email, avatarUrl: updated?.avatarUrl ?? null },
      });
    } catch (err) {
      next(err);
    }
  },

  // Multer (see uploadAvatar middleware) has already validated mimetype/size
  // and put the raw bytes on req.file.buffer — encode straight to a data URI
  // rather than writing to disk, since Avatar.avatarUrl is rendered directly
  // as an <img src>.
  uploadMyAvatar: async (req: any, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: 'No photo was uploaded' });
        return;
      }
      const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      const updated = await userRepository.update(req.user.userId, { avatarUrl: dataUri });
      res.json({
        success: true,
        data: { ...req.user, name: updated?.name, email: updated?.email, avatarUrl: updated?.avatarUrl ?? null },
      });
    } catch (err) {
      next(err);
    }
  },

  removeMyAvatar: async (req: any, res: Response, next: NextFunction) => {
    try {
      const updated = await userRepository.update(req.user.userId, { avatarUrl: null });
      res.json({
        success: true,
        data: { ...req.user, name: updated?.name, email: updated?.email, avatarUrl: updated?.avatarUrl ?? null },
      });
    } catch (err) {
      next(err);
    }
  },
};
