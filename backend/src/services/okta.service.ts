import crypto from 'crypto';
import jwt, { JwtHeader, SigningKeyCallback } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { env } from '../config/env';

// Okta's org-level authorization server has no auth-server-id segment in its
// endpoint URLs; a custom/default authorization server (the common case) does.
const IS_ORG_AUTH_SERVER = !env.okta.authServerId || env.okta.authServerId === 'org';
const ISSUER_BASE = IS_ORG_AUTH_SERVER
  ? `${env.okta.domain}/oauth2`
  : `${env.okta.domain}/oauth2/${env.okta.authServerId}`;

// The `iss` claim Okta actually puts in tokens differs from the endpoint
// path above for the org authorization server: its issuer is the bare org
// URL (no `/oauth2` suffix), while a custom/default authorization server's
// issuer matches its endpoint base exactly.
const EXPECTED_ISSUER = IS_ORG_AUTH_SERVER ? env.okta.domain : ISSUER_BASE;

const AUTHORIZE_ENDPOINT = `${ISSUER_BASE}/v1/authorize`;
const TOKEN_ENDPOINT = `${ISSUER_BASE}/v1/token`;
const JWKS_URI = `${ISSUER_BASE}/v1/keys`;

const jwks = jwksClient({
  jwksUri: JWKS_URI,
  cache: true,
  cacheMaxAge: 10 * 60 * 1000,
  rateLimit: true,
});

function getSigningKey(header: JwtHeader, callback: SigningKeyCallback) {
  jwks.getSigningKey(header.kid, (err, key) => {
    if (err || !key) {
      callback(err || new Error('Signing key not found'));
      return;
    }
    callback(null, key.getPublicKey());
  });
}

export interface OktaProfile {
  oktaId: string;
  email: string;
  name: string;
}

export const oktaService = {
  // The env module falls back to placeholder 'mock_*' values so local dev
  // without Okta configured still boots — treat those as "not configured".
  // No clientSecret check here: a public client (SPA-type app) legitimately
  // has none.
  isConfigured: (): boolean =>
    env.okta.clientId !== 'mock_client_id' && env.okta.domain !== 'https://mock.okta.com',

  // PKCE — the client (this server) keeps a secret code_verifier and sends
  // Okta only its hash (code_challenge) up front; Okta requires the matching
  // verifier at token exchange, so a leaked/intercepted authorization code
  // alone can't be redeemed by someone else.
  generatePkce: () => {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    return { codeVerifier, codeChallenge };
  },

  generateState: () => crypto.randomBytes(16).toString('base64url'),

  buildAuthorizeUrl: (state: string, codeChallenge: string): string => {
    const params = new URLSearchParams({
      client_id: env.okta.clientId,
      response_type: 'code',
      scope: 'openid profile email',
      redirect_uri: env.okta.redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
  },

  exchangeCode: async (code: string, codeVerifier: string): Promise<{ idToken: string }> => {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: env.okta.redirectUri,
      code_verifier: codeVerifier,
      // Required in the body for a public client (no secret) — Okta reads
      // it from the Basic auth header instead when one is a confidential
      // client, but sends it either way here doesn't hurt.
      client_id: env.okta.clientId,
    });

    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
    // Confidential client (real secret configured) → authenticate as
    // client_secret_basic. Public client (Okta "SPA" app, "Client
    // Authentication: None") → PKCE's code_verifier above is the proof of
    // possession instead, so no secret is sent at all.
    if (env.okta.clientSecret) {
      const basicAuth = Buffer.from(`${env.okta.clientId}:${env.okta.clientSecret}`).toString('base64');
      headers.Authorization = `Basic ${basicAuth}`;
    }

    const res = await fetch(TOKEN_ENDPOINT, { method: 'POST', headers, body });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Okta token exchange failed (${res.status}): ${text}`);
    }
    const data = (await res.json()) as { id_token?: string };
    console.log('[Okta] raw token response:', JSON.stringify(data, null, 2));
    if (!data.id_token) throw new Error('Okta token response had no id_token');
    return { idToken: data.id_token };
  },

  // Verifies the ID token's signature against Okta's published JWKS, and its
  // issuer/audience/expiry, before trusting any claim on it.
  verifyIdToken: (idToken: string): Promise<OktaProfile> => {
    return new Promise((resolve, reject) => {
      jwt.verify(
        idToken,
        getSigningKey,
        { algorithms: ['RS256'], issuer: EXPECTED_ISSUER, audience: env.okta.clientId },
        (err, decoded) => {
          if (err || !decoded || typeof decoded === 'string') {
            reject(err || new Error('Invalid Okta ID token'));
            return;
          }
          const claims = decoded as jwt.JwtPayload & {
            email?: string;
            preferred_username?: string;
            name?: string;
          };
          console.log('[Okta] decoded ID token claims:', JSON.stringify(claims, null, 2));
          const email = claims.email || claims.preferred_username;
          if (!claims.sub || !email) {
            reject(new Error('Okta ID token is missing sub/email claims'));
            return;
          }
          resolve({ oktaId: claims.sub, email, name: claims.name || email });
        }
      );
    });
  },
};
