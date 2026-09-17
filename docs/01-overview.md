# Overview

## What this is

**swfs-portal** is a recruiting/staffing portal. SWFS (a staffing agency)
recruits candidates on behalf of client organizations. The portal gives:

- **SWFS staff (`ADMIN` role)** — visibility across every client organization:
  all jobs, all candidates, internal cost data (`payRate`), and the ability
  to manage the client roster.
- **Client users (`CLIENT` role)** — visibility scoped to their own
  organization only: their open roles, the candidates pipelined against
  those roles, and the bill rate (never the internal pay rate or margin).

## Domain model, in one paragraph

An `Organization` is a client company. It has `Job`s (open roles). A
`Candidate` is a person in the pipeline, linked to one or more jobs through
an `Application` (the candidate/job pair, carrying a pipeline `stage` such
as `SCREENING` or `SHORTLISTED`). Client and SWFS users can leave
`CandidateFeedback` on a candidate. Every state-changing action is recorded
to `AuditLog` for the Activity feed. See
[data-model.md](04-backend/data-model.md) for the full entity reference.

## Stack

| Layer    | Technology |
|----------|------------|
| Backend  | Node.js, Express, TypeScript, TypeORM, PostgreSQL |
| Frontend | React 18, TypeScript, Vite, TanStack Query, React Router, Tailwind CSS |
| Auth     | Self-issued JWT, plus optional Okta SSO (Authorization Code + PKCE) |
| Uploads  | Multer, stored on local disk under `backend/uploads/` |

## Repository layout

```
DNA/
├── package.json          # root scripts that fan out to backend/frontend
├── backend/               # Express API (backend/src)
├── frontend/              # React app (frontend/src)
└── docs/                  # this documentation
```

See [setup.md](03-setup.md) to get it running locally, then
[architecture.md](02-architecture.md) for how the pieces fit together.
