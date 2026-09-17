# Architecture

## Request flow

```
Browser (React SPA, :5173)
   │  fetch /api/* — Vite dev proxy forwards to :5000 (see frontend/vite.config.ts)
   ▼
Express app (backend/src/app.ts)
   │  helmet → cors → rate limit (/api, 300 req/15min) → morgan → body/cookie parsers
   ▼
routes/*  (mount points: /api/auth, /api/dashboard, /api/jobs,
           /api/candidates, /api/organization, /api/activity)
   │  authenticate (JWT) → requireRole/requireExactRole (RBAC) → multer (uploads)
   ▼
controllers/*  — parse req, enforce per-role field scoping, call services, shape ApiResponse
   ▼
services/*     — business rules (org scoping, stage transitions, file handling)
   ▼
repositories/* — thin wrappers around AppDataSource.getRepository(Entity)
   ▼
PostgreSQL  (via TypeORM entities in backend/src/entities)
```

Every JSON response follows the same envelope (`types/index.ts`):

```ts
{ success: boolean; data?: T; message?: string; error?: string }
```

## Backend layering

- **routes/** — wires an HTTP verb+path to a controller method, and declares
  the middleware chain for that route (auth required? which roles? file
  upload?). No business logic here — see [api-reference.md](04-backend/api-reference.md).
- **controllers/** — read `req`, do request-shape validation (required
  fields), decide the *org scope* to enforce, call the matching service, and
  translate the result (or thrown error) into an HTTP response. This is also
  where role-based field scoping happens — e.g. `jobController` strips
  `payRate` from responses for non-admins (see
  [auth-and-security.md](04-backend/auth-and-security.md)).
- **services/** — the actual business logic: pipeline stage transitions,
  résumé/JD file lifecycle, Okta token exchange, company-page scraping.
- **repositories/** — one per aggregate root, wrapping TypeORM queries so
  services don't call `AppDataSource.getRepository()` directly.
- **entities/** — TypeORM `@Entity` classes = the Postgres schema. See
  [data-model.md](04-backend/data-model.md).
- **middleware/** — `auth.middleware.ts` (JWT verification),
  `rbac.middleware.ts` (role checks), `upload.middleware.ts` (multer configs
  for résumés/JDs), `error.middleware.ts` (central error → JSON translation).
- **config/** — `env.ts` (typed env var access with defaults) and
  `data-source.ts` (TypeORM `DataSource`, connects on boot).

Org scoping is the load-bearing convention throughout the backend: almost
every service method takes an `orgScope: string | null` parameter —
`null` for `ADMIN` (see everything), an organization id for `CLIENT` (see
only that org's rows). Controllers compute this once per request via
`isAdminRole(req.user!.role) ? null : req.user!.organizationId` and pass it
down; the actual filtering happens in the repository/service layer, not in
the controller.

## Frontend layering

- **pages/** — one component per route (`App.tsx` maps paths to pages).
- **components/** — `layout/` (shell: sidebar, header), `shared/`
  (design-system primitives: Button, Modal, Table, Toast…), and
  feature-specific components (`jobs/`, `auth/`).
- **api/** — one file per backend resource (`job.api.ts`,
  `candidate.api.ts`…), each a thin wrapper over the shared `axios` instance
  (`api/axios.ts`) that attaches the JWT and redirects to `/login` on 401.
- **hooks/** — TanStack Query hooks (`useJobs`, `useCandidates`,
  `useOrganizations`) built on `api/queryKeys.ts`'s canonical key list, so
  queries and cache invalidations can't drift apart.
- **context/** — `AuthContext` (session state, login/logout, Okta callback
  handling) and `ThemeContext`.
- **types/** — TypeScript types mirroring the backend's API shapes.

See [structure.md](05-frontend/structure.md) for the full breakdown.

## Data flow example: shortlisting a candidate

1. Frontend calls `candidateApi.shortlist(id, jobId)` → `POST
   /api/candidates/:id/shortlist`.
2. `auth.middleware` verifies the JWT; `rbac.middleware`'s `requireRole('CLIENT', 'ADMIN')` passes (both roles may shortlist).
3. `candidateController.shortlist` validates `jobId` is present, computes
   `orgScope`, calls `candidateService.shortlistCandidate(id, jobId, orgScope)`.
4. The service loads the `Application` row scoped to that org (a `CLIENT`
   can't shortlist a candidate against another org's job), updates `stage`
   and `stageUpdatedAt`.
5. `auditLogService.log(...)` writes an `AuditLog` row.
6. Controller responds `{ success: true, data: <updated candidate> }`.
7. TanStack Query's mutation `onSuccess` invalidates `queryKeys.candidates`
   (and/or `queryKeys.jobPipeline(jobId)`), triggering a refetch.
