# Deployment

There's no deployment pipeline configured yet (no Dockerfile, no CI/CD
config in the repo at the time of writing) — this documents what's known
from the code so a deployment can be set up.

## Build artifacts

```bash
npm --prefix backend run build    # tsc → backend/dist/app.js
npm --prefix backend run start    # node dist/app.js

npm --prefix frontend run build   # tsc && vite build → frontend/dist/ (static)
```

The backend is a standard Express process; the frontend build is static
assets that need a web server / CDN / static host in front of them, with
`/api/*` proxied or otherwise routed to the backend (in dev, Vite's own
proxy does this — in production, put a reverse proxy, e.g. nginx, or your
hosting platform's routing, in front of both).

## Required environment (production)

All from `backend/src/config/env.ts` — see the full list and notes in
[setup.md](03-setup.md#configure-environment). Production-specific points:

- **`JWT_SECRET`** — must be overridden; the code falls back to a hardcoded
  dev string if unset.
- **`NODE_ENV=production`** — flips two behaviors in `config/data-source.ts`:
  `synchronize` turns **off** and `logging` turns **off**. This means:
  **schema migrations must exist and run before the first production
  deploy** — currently the repo has no files under `backend/src/migrations/`
  yet, since local dev relies on `synchronize: true` instead. Generate and
  commit real TypeORM migrations before going to production, or the schema
  will simply not exist.
- **`FRONTEND_URL`** — used for CORS and every browser-facing redirect
  (login errors, Okta's post-callback redirect target). Must be the real
  production frontend origin.
- **`OKTA_REDIRECT_URI`** — must exactly match the redirect URI registered
  on the Okta app integration, and use the production backend's public
  URL.
- **`PGSSL=true`** (or set via `DATABASE_URL`'s `sslmode`) — for a managed
  Postgres instance that requires TLS.
- **`DATABASE_URL`** vs. discrete `PG*` vars — either works; most managed
  Postgres providers hand you a single connection string.

## File storage

`backend/uploads/` is local disk (see
[file-uploads.md](06-file-uploads.md#operational-notes)). This works for a
single, persistent-disk instance, but breaks under:
- **Redeploys on ephemeral filesystems** (most container platforms) — files
  vanish on every deploy.
- **Multiple backend instances** — an upload lands on one instance's disk
  and a download hitting a different instance 404s.

Before deploying to either kind of environment, move résumé/JD storage to
object storage (S3-compatible), keeping the same authenticated,
org-scoped download-route pattern rather than serving files statically.

## Health check

`GET /health` → `{ status: 'ok', timestamp }`, unauthenticated, defined
before the `/api` mount in `app.ts` — use this for a load balancer /
orchestrator liveness probe.

## Okta configuration checklist

- Register the deployed backend's `OKTA_REDIRECT_URI`
  (`https://<backend-host>/api/auth/okta/callback`) as a "Sign-in redirect
  URI" on the Okta app integration.
- SPA app integration ("Client Authentication: None") → leave
  `OKTA_CLIENT_SECRET` unset. Confidential "Web" app → set it.
- `OKTA_AUTH_SERVER_ID` — `'default'` unless using a custom-named
  authorization server, or `'org'` for the Org Authorization Server (see
  `okta.service.ts`'s `IS_ORG_AUTH_SERVER` handling).
