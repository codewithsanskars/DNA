import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { userRepository } from '../repositories/user.repository';
import { env } from '../config/env';

export const authController = {
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

  // STUB: Initiates Okta SSO. Replace redirect URL with real Okta authorization endpoint.
  oktaLogin: (req: Request, res: Response) => {
    const mockCallbackUrl = `${env.okta.redirectUri}?mock=true&email=client.admin@techcorp.com`;
    res.redirect(mockCallbackUrl);
  },

  // STUB: Handles Okta callback. Replace with real code↔token exchange.
  oktaCallback: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const email = (req.query.email as string) || 'client.admin@techcorp.com';
      const result = await authService.handleOktaCallback(email);
      const redirectUrl = `${env.frontendUrl}/auth/callback?token=${result.token}`;
      res.redirect(redirectUrl);
    } catch (err) {
      next(err);
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
