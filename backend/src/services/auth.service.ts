import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { userRepository } from '../repositories/user.repository';
import { organizationRepository } from '../repositories/organization.repository';
import { JwtPayload, UserRole } from '../types';
import { OktaProfile } from './okta.service';

// Demo/prototype login — maps a known email to its seeded org + role so the
// portal is explorable without every account needing to exist in Okta first.
// Any other email (including real Okta logins) is auto-provisioned as a
// CLIENT under the default org, or keeps whatever org/role it already has.
const MOCK_USER_ORG_MAP: Record<string, { orgSlug: string; role: UserRole }> = {
  'admin@swfs.ai': { orgSlug: 'org_techcorp', role: 'ADMIN' },
  'client.admin@techcorp.com': { orgSlug: 'org_techcorp', role: 'CLIENT' },
  'client.admin@financegroup.com': { orgSlug: 'org_financegroup', role: 'CLIENT' },
  'client.admin@meridianhealth.com': { orgSlug: 'org_meridianhealth', role: 'CLIENT' },
};
const DEFAULT_ORG_SLUG = 'org_techcorp';

type UserRecord = { id: string; email: string; name: string; oktaId?: string };

export const authService = {
  loginByEmail: async (email: string): Promise<{ token: string; user: any }> => {
    const normalizedEmail = email.toLowerCase().trim();

    let user = await userRepository.findByEmail(normalizedEmail);
    if (!user) {
      // Auto-provision user for prototype
      const namePart = normalizedEmail.split('@')[0].replace(/[._]/g, ' ');
      const name = namePart.replace(/\b\w/g, (c) => c.toUpperCase());
      user = await userRepository.create({ email: normalizedEmail, name });
    }

    return authService.completeLogin(user, normalizedEmail);
  },

  // Called once the Okta authorization code has been exchanged and the ID
  // token verified — `profile` is trusted at this point. Links the Okta
  // subject to an existing account (matched by prior Okta login, then by
  // email) or provisions a new one.
  handleOktaCallback: async (profile: OktaProfile): Promise<{ token: string; user: any }> => {
    const normalizedEmail = profile.email.toLowerCase().trim();

    let user = await userRepository.findByOktaId(profile.oktaId);
    if (!user) user = await userRepository.findByEmail(normalizedEmail);
    if (!user) user = await userRepository.create({ email: normalizedEmail, name: profile.name });

    if (user.oktaId !== profile.oktaId) {
      user = (await userRepository.update(user.id, { oktaId: profile.oktaId })) || user;
    }

    return authService.completeLogin(user, normalizedEmail);
  },

  // Shared tail for both login paths: resolve the org + role (known demo
  // mapping, else an existing membership, else default CLIENT), record the
  // login, and issue our own JWT.
  completeLogin: async (user: UserRecord, normalizedEmail: string): Promise<{ token: string; user: any }> => {
    const mapping = MOCK_USER_ORG_MAP[normalizedEmail];
    let org = await organizationRepository.findBySlug(mapping?.orgSlug || DEFAULT_ORG_SLUG);
    let role: UserRole = mapping?.role || 'CLIENT';
    if (!mapping) {
      const existingMemberships = await userRepository.findOrganizationsForUser(user.id);
      if (existingMemberships[0]) {
        role = existingMemberships[0].role as UserRole;
        org = await organizationRepository.findById(existingMemberships[0].organizationId);
      }
    }
    if (!org) org = await organizationRepository.findBySlug(DEFAULT_ORG_SLUG);

    if (org) {
      await userRepository.addToOrganization({ organizationId: org.id, userId: user.id, role });
    }
    await userRepository.updateLastLogin(user.id);

    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role,
      organizationId: org?.id || '',
      organizationName: org?.name || 'TechCorp Inc',
    };

    const token = jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as any });
    return { token, user: { ...payload, name: user.name } };
  },

  verifyToken: (token: string): JwtPayload => {
    return jwt.verify(token, env.jwtSecret) as JwtPayload;
  },
};
