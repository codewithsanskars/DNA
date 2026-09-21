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
  'admin@swfs.ai': {
     orgSlug: 'org_techcorp', role: 'ADMIN' },

  'client.@techcorp.com': { orgSlug: 'org_techcorp', role: 'CLIENT' },
  
  'client.admin@financegroup.com': { orgSlug: 'org_financegroup', role: 'CLIENT' },
  'client.admin@meridianhealth.com': { orgSlug: 'org_meridianhealth', role: 'CLIENT' },
};
const DEFAULT_ORG_SLUG = 'org_techcorp';

type UserRecord = { id: string; email: string; name: string; oktaId?: string; avatarUrl?: string | null };

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

    const user = await userRepository.findByEmail(normalizedEmail);
    if (!user) {
      // Unlike the Okta path (which hands back a `register` result so the
      // frontend can confirm an org before creating anything), this plain
      // email login used to auto-provision a brand-new account for *any*
      // unrecognized address. That silently orphaned people who'd renamed
      // their own email via the profile page and then signed back in with
      // their old address (e.g. a stale "demo account" shortcut): instead of
      // erroring, it spun up a fresh blank account under the old address.
      throw Object.assign(
        new Error(
          `No account found for ${normalizedEmail}. If you recently changed your email, sign in with your new address instead.`
        ),
        { statusCode: 404 }
      );
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
    return { token, user: { ...jwtPayload, name: user.name, avatarUrl: user.avatarUrl ?? null } };
  },

  // Shared tail for both login paths: resolve the org + role (an existing
  // membership, else the known demo mapping, else default CLIENT), record the
  // login, and issue our own JWT.
  completeLogin: async (user: UserRecord, normalizedEmail: string): Promise<{ token: string; user: any }> => {
    // A real membership wins over MOCK_USER_ORG_MAP: the map is only a
    // bootstrap for seeded demo accounts, so it must not drag a user who has
    // since been placed in a different organization back to its hard-coded one.
    const [membership] = await userRepository.findOrganizationsForUser(user.id);
    let org = membership ? await organizationRepository.findById(membership.organizationId) : null;
    let role: UserRole = (membership?.role as UserRole) || 'CLIENT';

    if (!org) {
      const mapping = MOCK_USER_ORG_MAP[normalizedEmail];
      role = mapping?.role || 'CLIENT';
      org = await organizationRepository.findBySlug(mapping?.orgSlug || DEFAULT_ORG_SLUG);
    }

    // Fail here rather than issuing a token with an empty organizationId:
    // '' is not a valid uuid, so every org-scoped query would blow up with an
    // opaque "invalid input syntax for type uuid" 500 on some later request.
    if (!org) {
      throw Object.assign(
        new Error(
          `No organization found for ${normalizedEmail}. Seed the database (npm run seed) or add this user to an organization.`
        ),
        { statusCode: 403 }
      );
    }

    await userRepository.addToOrganization({ organizationId: org.id, userId: user.id, role });
    await userRepository.updateLastLogin(user.id);

    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role,
      organizationId: org.id,
      organizationName: org.name,
    };

    const token = jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as any });
    return { token, user: { ...payload, name: user.name, avatarUrl: user.avatarUrl ?? null } };
  },

  verifyToken: (token: string): JwtPayload => {
    return jwt.verify(token, env.jwtSecret) as JwtPayload;
  },
};
