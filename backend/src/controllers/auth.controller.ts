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
      res.redirect(`${env.frontendUrl}/auth/callback?token=${result.token}`);
    } catch (err) {
      console.error('[Okta] callback failed:', (err as Error).message);
      redirectToLoginError(res, 'okta_failed');
    }
  },

  me: async (req: any, res: Response, next: NextFunction) => {
    try {
      const user = await userRepository.findById(req.user.userId);
      res.json({ success: true, data: { ...req.user, name: user?.name } });
    } catch (err) {
      next(err);
    }
  },
};
