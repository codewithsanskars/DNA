import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { userRepository } from '../repositories/user.repository';
import { organizationRepository } from '../repositories/organization.repository';
import { organizationService } from './organization.service';
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

// Short-lived token that carries a first-time Okta identity across the
// "pick your organization" registration step, since we don't create the
// User row (or know their org) until that form is submitted.
interface OktaPendingPayload {
  purpose: 'okta_registration';
  oktaId: string;
  email: string;
  name: string;
}

export type OktaCallbackResult =
  | { status: 'login'; token: string; user: any }
  | { status: 'register'; pendingToken: string; email: string; name: string };

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
  // email) and logs them in directly. A brand-new identity isn't
  // auto-provisioned: we hand back a short-lived pending token instead so the
  // frontend can ask which organization they belong to before the account
  // (and its CLIENT membership) is created.
  handleOktaCallback: async (profile: OktaProfile): Promise<OktaCallbackResult> => {
    const normalizedEmail = profile.email.toLowerCase().trim();

    let user = await userRepository.findByOktaId(profile.oktaId);
    if (!user) user = await userRepository.findByEmail(normalizedEmail);

    if (!user) {
      const pendingToken = jwt.sign(
        { purpose: 'okta_registration', oktaId: profile.oktaId, email: normalizedEmail, name: profile.name },
        env.jwtSecret,
        { expiresIn: '15m' }
      );
      return { status: 'register', pendingToken, email: normalizedEmail, name: profile.name };
    }

    if (user.oktaId !== profile.oktaId) {
      user = (await userRepository.update(user.id, { oktaId: profile.oktaId })) || user;
    }

    const result = await authService.completeLogin(user, normalizedEmail);
    return { status: 'login', ...result };
  },

  // Finishes registration for a first-time Okta sign-in: verifies the
  // pending token from handleOktaCallback, creates the user (if the frontend
  // round-trip is the first time we're seeing them), and puts them into the
  // named organization — creating it if it doesn't exist yet — as a CLIENT.
  // Everyone who registers this way starts as CLIENT; promoting to ADMIN is
  // a separate, deliberate action, not something Okta SSO grants.
  completeOktaRegistration: async (
    pendingToken: string,
    organizationName: string
  ): Promise<{ token: string; user: any }> => {
    let payload: OktaPendingPayload;
    try {
      payload = jwt.verify(pendingToken, env.jwtSecret) as OktaPendingPayload;
    } catch {
      throw new Error('Registration link expired — please sign in with Okta again.');
    }
    if (payload.purpose !== 'okta_registration') {
      throw new Error('Invalid registration token');
    }

    const trimmedOrgName = organizationName.trim();
    if (!trimmedOrgName) throw new Error('Organization name is required');

    let user = await userRepository.findByOktaId(payload.oktaId);
    if (!user) user = await userRepository.findByEmail(payload.email);
    if (!user) user = await userRepository.create({ email: payload.email, name: payload.name });
    if (user.oktaId !== payload.oktaId) {
      user = (await userRepository.update(user.id, { oktaId: payload.oktaId })) || user;
    }

    // Reuse an existing org with this name (case-insensitive) instead of
    // creating a duplicate every time another person from the same company
    // signs up.
    const allOrgs = await organizationRepository.findAll();
    let org = allOrgs.find((o: any) => o.name.toLowerCase() === trimmedOrgName.toLowerCase());
    if (!org) org = await organizationService.createOrganization({ name: trimmedOrgName });

    await userRepository.addToOrganization({ organizationId: org.id, userId: user.id, role: 'CLIENT' });
    await userRepository.updateLastLogin(user.id);

    const jwtPayload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: 'CLIENT',
      organizationId: org.id,
      organizationName: org.name,
    };
    const token = jwt.sign(jwtPayload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as any });
    return { token, user: { ...jwtPayload, name: user.name } };
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
