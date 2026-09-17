# Local setup

## Prerequisites

- Node.js (backend uses `ts-node`/TypeScript 5.3, targets ES2020 — Node 18+
  recommended)
- PostgreSQL, running locally or reachable via `DATABASE_URL`
- (Optional) an Okta app integration, if you want to exercise SSO login
  instead of the email-only path

## Install

From the repo root (`DNA/`), the root `package.json` fans out to both apps:

```bash
npm run install:all      # npm install in backend/ and frontend/
```

## Configure environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` — see the annotated
[.env.example](../backend/.env.example) for the full list. The essentials:

| Var | Default | Notes |
|---|---|---|
| `PORT` | `5000` | backend HTTP port |
| `DATABASE_URL` | — | or set the discrete `PGHOST`/`PGPORT`/`PGDATABASE`/`PGUSER`/`PGPASSWORD`/`PGSSL` vars instead |
| `JWT_SECRET` | insecure dev default | **override this** outside local dev |
| `JWT_EXPIRES_IN` | `7d` | |
| `FRONTEND_URL` | `http://localhost:5173` | used for CORS and for building redirect URLs (login errors, Okta callback) |
| `OKTA_DOMAIN`, `OKTA_CLIENT_ID`, `OKTA_REDIRECT_URI`, `OKTA_AUTH_SERVER_ID` | mock placeholders | leave unset to disable SSO — `GET /api/auth/okta/status` reports `configured: false` and the frontend hides the SSO button |
| `OKTA_CLIENT_SECRET` | unset | only for a confidential "Web" app integration; leave unset for a public "SPA" app (PKCE-only) |

The frontend has no `.env` of its own — in dev it talks to `/api`, proxied
to `http://localhost:5000` by `frontend/vite.config.ts`'s `server.proxy`.

## Database

Point the env vars above at a running Postgres instance and create the
database (e.g. `createdb swfs_portal`). In non-production, TypeORM's
`synchronize: true` (`backend/src/config/data-source.ts`) creates the
schema from the entities automatically on first boot — no migration step
needed for local dev.

Seed demo data (3 client organizations, an SWFS admin user, jobs,
candidates — see `backend/src/scripts/seed.ts`):

```bash
npm run seed              # from DNA/, or: npm --prefix backend run seed
```

Safe to re-run — it truncates the app tables first.

## Run

```bash
npm run dev:backend       # ts-node-dev, http://localhost:5000
npm run dev:frontend      # vite dev server, http://localhost:5173
```

Run both (two terminals), then open `http://localhost:5173`.

**Sign in**: with the database seeded, use one of the demo emails from
`MOCK_USER_ORG_MAP` in `auth.service.ts` (e.g. `admin@swfs.ai` for the SWFS
admin view, or `client.admin@techcorp.com` for a client view) on the
email-only login form — no password. Any other email auto-provisions a new
`CLIENT` user in the default seeded org.

Health check: `GET http://localhost:5000/health` → `{ status: 'ok', timestamp }`.

## Build

```bash
npm --prefix backend run build     # tsc → backend/dist
npm --prefix backend run start     # node dist/app.js
npm --prefix frontend run build    # tsc && vite build → frontend/dist
npm --prefix frontend run preview  # serve the production build locally
```

## Troubleshooting

- **Login fails with "No organization found for ..."** — the database
  hasn't been seeded, or you're logging in with an email that isn't in
  `MOCK_USER_ORG_MAP` and no default org exists yet. Run `npm run seed`.
- **`[DB] PostgreSQL unavailable` at boot** — the server still starts (it
  doesn't crash on a failed DB connection), but every request that touches
  the database will fail. Check your Postgres connection vars.
- **Okta SSO button missing** — expected when `OKTA_*` vars are unset;
  `oktaService.isConfigured()` treats the placeholder defaults as "not
  configured."
