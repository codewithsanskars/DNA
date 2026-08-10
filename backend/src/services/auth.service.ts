import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { userRepository } from '../repositories/user.repository';
import { organizationRepository } from '../repositories/organization.repository';
import { JwtPayload, UserRole } from '../types';

const MOCK_USER_ORG_MAP: Record<string, { orgId: string; role: UserRole }> = {
  'admin@swfs.ai': { orgId: 'org_techcorp', role: 'SWFS_ADMIN' },
  'client.admin@techcorp.com': { orgId: 'org_techcorp', role: 'CLIENT_ADMIN' },
  'hiring@techcorp.com': { orgId: 'org_techcorp', role: 'HIRING_MANAGER' },
  'viewer@techcorp.com': { orgId: 'org_techcorp', role: 'VIEWER' },
  'client.admin@financegroup.com': { orgId: 'org_financegroup', role: 'CLIENT_ADMIN' },
  'hiring@financegroup.com': { orgId: 'org_financegroup', role: 'HIRING_MANAGER' },
};

export const authService = {
  loginByEmail: async (email: string): Promise<{ token: string; user: any }> => {
    const normalizedEmail = email.toLowerCase().trim();

    let user = await userRepository.findByEmail(normalizedEmail);
    if (!user) {
      // Auto-provision user for prototype
      const mapping = MOCK_USER_ORG_MAP[normalizedEmail];
      const role: UserRole = mapping?.role || 'VIEWER';
      const namePart = normalizedEmail.split('@')[0].replace(/[._]/g, ' ');
      const name = namePart.replace(/\b\w/g, (c) => c.toUpperCase());

      user = await userRepository.create({ email: normalizedEmail, name, role });
    }

    const mapping = MOCK_USER_ORG_MAP[normalizedEmail];
    const orgSlug = mapping?.orgId || 'org_techcorp';
    const org = await organizationRepository.findBySlug(orgSlug);

    await userRepository.updateLastLogin(user.id);

    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: (mapping?.role || user.role) as UserRole,
      organizationId: org?.id || orgSlug,
      organizationName: org?.name || 'TechCorp Inc',
    };

    const token = jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as any });
    return { token, user: { ...payload, name: user.name } };
  },

  verifyToken: (token: string): JwtPayload => {
    return jwt.verify(token, env.jwtSecret) as JwtPayload;
  },

  // STUB: Returns mock Okta auth URL. Replace with real Okta OIDC flow.
  getOktaAuthUrl: (): string => {
    return `/api/auth/okta/callback?mock=true&email=client.admin@techcorp.com`;
  },

  // STUB: Validates Okta callback. Replace with real token exchange.
  handleOktaCallback: async (mockEmail: string): Promise<{ token: string; user: any }> => {
    return authService.loginByEmail(mockEmail);
  },
};
