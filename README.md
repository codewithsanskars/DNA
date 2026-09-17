# SWFS Portal

A recruiting/staffing portal: SWFS staff manage jobs and candidates across
client organizations; each client sees only their own roles and pipeline.

- **Backend**: Node.js, Express, TypeScript, TypeORM, PostgreSQL (`backend/`)
- **Frontend**: React 18, TypeScript, Vite, TanStack Query (`frontend/`)
- **Auth**: self-issued JWT, with optional Okta SSO (Authorization Code + PKCE)

## Quick start

```bash
npm run install:all
cp backend/.env.example backend/.env   # then edit as needed
npm run seed                            # requires Postgres running & reachable
npm run dev:backend                     # http://localhost:5000
npm run dev:frontend                    # http://localhost:5173
```

Full setup, environment variables, and troubleshooting: [docs/03-setup.md](docs/03-setup.md).

## Documentation

| Doc | Covers |
|---|---|
| [docs/01-overview.md](docs/01-overview.md) | Domain model, stack, repo layout |
| [docs/02-architecture.md](docs/02-architecture.md) | Request flow, backend/frontend layering, org-scoping convention |
| [docs/03-setup.md](docs/03-setup.md) | Prerequisites, install, env vars, seeding, running, troubleshooting |
| [docs/04-backend/api-reference.md](docs/04-backend/api-reference.md) | Every route: auth, role, org scope, request/response |
| [docs/04-backend/data-model.md](docs/04-backend/data-model.md) | Entities, relationships, ER diagram, enums |
| [docs/04-backend/auth-and-security.md](docs/04-backend/auth-and-security.md) | Email login, Okta SSO, RBAC, org scoping, field scoping |
| [docs/05-frontend/structure.md](docs/05-frontend/structure.md) | Routing, API layer, data fetching, components, types |
| [docs/05-frontend/state-and-routing.md](docs/05-frontend/state-and-routing.md) | Server state vs. context vs. per-viewer localStorage |
| [docs/06-file-uploads.md](docs/06-file-uploads.md) | Résumé/JD upload, storage, validation, replace/delete semantics |
| [docs/07-deployment.md](docs/07-deployment.md) | Build, required production env, migrations, file storage, Okta setup |
