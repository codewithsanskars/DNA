# Authentication, authorization & security

## Two ways to sign in

1. **Email-only login** (`POST /api/auth/login`) — a prototype/demo path.
   Any email logs in; if the `User` doesn't exist yet it's auto-provisioned.
   Org + role are resolved by `authService.completeLogin`:
   - an existing `OrganizationMembership` wins if one exists;
   - otherwise the seeded `MOCK_USER_ORG_MAP` in `auth.service.ts` maps a
     handful of demo emails (`admin@swfs.ai`, `client.admin@techcorp.com`,
     …) to an org + role;
   - otherwise the user is dropped into the default seeded org as `CLIENT`.
   - If no organization can be resolved at all, login fails with 403 rather
     than issuing a token with an empty `organizationId` (which would break
     every org-scoped query downstream with an opaque UUID-cast error).

2. **Okta SSO** (Authorization Code + PKCE) — `GET /api/auth/okta/login` →
   Okta → `GET /api/auth/okta/callback`:
   - `oktaService.generateState()` / `generatePkce()` produce a CSRF `state`
     and a PKCE `code_verifier`/`code_challenge` pair, stashed in short-lived
     (`10min`), `httpOnly`, path-scoped cookies (`okta_state`,
     `okta_verifier`) — never sent to the frontend or logged.
   - The callback verifies `state` matches, exchanges the code for an ID
     token, and verifies that token's signature against Okta's JWKS
     (`jwt.verify` with `algorithms: ['RS256']`, checking `issuer` and
     `audience`) before trusting any claim on it.
   - **Existing identity** (matched by `oktaId`, then by email) → logs in
     directly, same as email login.
   - **First-time identity** → *not* auto-provisioned. The callback issues a
     short-lived (`15min`) `pendingToken` JWT and redirects the frontend to
     show an "which organization are you with?" modal
     (`OktaRegisterModal.tsx`). Submitting it calls `POST
     /api/auth/okta/register`, which creates the `User`, creates-or-reuses
     the named `Organization` (case-insensitive match), and adds a `CLIENT`
     membership — everyone who self-registers this way starts as `CLIENT`;
     promotion to `ADMIN` is a separate, deliberate action, never something
     SSO grants on its own.
   - Supports both Okta app types: a public "SPA" app (PKCE only, no
     `OKTA_CLIENT_SECRET`) or a confidential "Web" app
     (`OKTA_CLIENT_SECRET` set → `client_secret_basic`).

Both paths converge on the same self-issued JWT (`JWT_SECRET`,
`JWT_EXPIRES_IN`, default 7d), containing `{ userId, email, role,
organizationId, organizationName }` (`types/index.ts`'s `JwtPayload`). The
frontend stores it in `localStorage` (`swfs_token`) and attaches it as
`Authorization: Bearer <token>` on every API call (`api/axios.ts`).

## Middleware chain

- **`authenticate`** (`middleware/auth.middleware.ts`) — requires and
  verifies the bearer JWT, attaches the payload to `req.user`. 401 if
  missing/invalid/expired.
- **`requireRole(...roles)`** (`middleware/rbac.middleware.ts`) — a
  **minimum-level** check against a two-tier hierarchy (`ADMIN: 2 > CLIENT:
  1`). `requireRole('CLIENT', 'ADMIN')` passes for both roles, since ADMIN
  outranks CLIENT.
- **`requireExactRole(...roles)`** — matches the caller's role exactly, no
  hierarchy. Used where an action is a client-only *workflow*, not a
  minimum permission level — e.g. only the client who owns a job attaches
  its job description; an admin acting on their behalf isn't the intended
  flow.
- **`requireOrganizationAccess`** — defined but not currently wired into any
  route; controllers instead compute org scope inline (`isAdminRole(...) ?
  null : req.user!.organizationId`) and pass it down to the service layer.

## Org scoping — the core authorization rule

There's no separate "policy" layer — org scoping is enforced by every
service/repository method taking an `organizationId: string | null`
parameter (`null` = admin, sees everything). Controllers compute this once
per request via `utils/roles.ts`'s `isAdminRole()` and pass it straight
through. See [architecture.md](../02-architecture.md#backend-layering) and
[data-model.md](data-model.md) for how `Candidate` (which has no org column
of its own) is scoped by joining through its `Application`s.

## Role-based field scoping

Beyond row-level scoping, some *fields* are stripped per role even within a
row the caller is allowed to see. `job.controller.ts`'s `scopeJobForRole()`
removes `payRate` entirely for `CLIENT` responses and adds a computed
`grossMargin` for `ADMIN` — this is enforced in the controller, independent
of whatever the repository query returns, so a bug in the query layer can't
leak it. The same rule applies in reverse on write: `payRate` in a
create/update request body is silently dropped unless the caller is
`ADMIN`.

## Other protections

- **`helmet()`** — standard security headers.
- **CORS** — locked to `FRONTEND_URL`, `credentials: true` (needed for the
  Okta state/verifier cookies).
- **Rate limiting** — `/api/*` capped at 300 requests / 15 min per client
  (`express-rate-limit`).
- **File uploads** (`middleware/upload.middleware.ts`) — résumés and job
  descriptions: `.pdf`/`.docx` only (extension *and* MIME type checked),
  10MB max, stored under `backend/uploads/{resumes,job-descriptions}/` with
  a random UUID filename (the original filename is kept only as display
  metadata, never used as the on-disk name). Files are served exclusively
  through authenticated, org-scoped download routes — never via a static
  file mount.
- **SSRF guard** (`utils/ssrfGuard.ts`, used by `scrape.service.ts`) — the
  "add organization" scraper fetches an admin-supplied URL, so
  `assertPublicHost()` rejects internal/private hosts before fetching, plus
  a 10s timeout and 3MB response cap.
- **Audit log** — nearly every mutating action is recorded (`AuditLog`),
  capturing `userId`, `userEmail`, `organizationId`, `action`, `entityType`,
  `entityId`, and a `details` JSON blob — see
  [data-model.md](data-model.md#auditlog).

## Known gaps (prototype-stage — flag before production)

- `JWT_SECRET` defaults to a hardcoded string in `config/env.ts` if unset —
  make sure it's overridden in every real environment.
- `synchronize: true` (schema auto-sync from entities) is active outside
  production; switch to migrations before then (see
  [data-model.md](data-model.md)).
- The email-only login path has no password and no verification — it's a
  prototype convenience, not meant to survive to production alongside real
  Okta SSO.
