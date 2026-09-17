# API reference

Base path: `/api` (proxied from the Vite dev server on `:5173` to the
Express server on `:5000` — see `frontend/vite.config.ts`).

All responses use the envelope `{ success, data?, message?, error? }`
(`types/index.ts`'s `ApiResponse<T>`). Endpoints below are grouped by route
file; auth/role requirements are the middleware chain declared in
`routes/*.ts`.

- **Auth**: `authenticate` — requires `Authorization: Bearer <jwt>`, set
  from `req.user` (see [auth-and-security.md](auth-and-security.md)).
- **Role**: `requireRole('CLIENT', 'ADMIN')` means minimum level CLIENT (so
  either role passes, since ADMIN outranks CLIENT); `requireExactRole('CLIENT')`
  means CLIENT only, no ADMIN override.
- **Org scope**: whether the handler restricts results/writes to the
  caller's own organization (`CLIENT`) or sees everything (`ADMIN`).

## Auth — `/api/auth`

| Method & path | Auth | Description |
|---|---|---|
| `POST /login` | none | Body `{ email }`. Prototype email-only login — auto-provisions a `User` if unseen, resolves org/role via existing membership or the seeded `MOCK_USER_ORG_MAP`. Returns `{ token, user }`. |
| `GET /okta/status` | none | `{ configured: boolean }` — lets the frontend hide the "Continue with Okta" button when Okta env vars aren't set. |
| `GET /okta/login` | none | Redirects to Okta's `/authorize` (Authorization Code + PKCE). Sets short-lived `okta_state`/`okta_verifier` cookies. |
| `GET /okta/callback` | none | Okta's redirect target. Exchanges the code, verifies the ID token, then either redirects to `/auth/callback?token=...` (existing user) or `/auth/callback?register=1&pendingToken=...` (first-time identity). |
| `POST /okta/register` | none | Body `{ pendingToken, organizationName }`. Completes first-time Okta signup: creates the `User` (if needed), creates or reuses the named `Organization`, adds a `CLIENT` membership. Returns `{ token, user }`. |
| `GET /me` | ✅ | Returns the JWT payload merged with the current `name` from the DB. |

## Dashboard — `/api/dashboard`

| Method & path | Auth | Org scope | Description |
|---|---|---|---|
| `GET /` | ✅ | ADMIN: global · CLIENT: own org | Summary: `openJobs`, `totalJobs`, `totalCandidates`, `shortlisted`, `inInterview`, `selected` (OFFER+HIRED), `pipelineSummary` (count per `CandidateStage`), `recentActivity` (last 5 audit log entries). |

## Jobs — `/api/jobs`

| Method & path | Role | Org scope | Description |
|---|---|---|---|
| `GET /` | any | ADMIN: all · CLIENT: own org | List jobs. |
| `POST /` | CLIENT, ADMIN | writes to caller's org, unless ADMIN passes `organizationId` to assign it to a specific client | Body: `title` (required), `department`, `location`, `status`, `openedAt`, `description`, `payRate` (ADMIN only — silently dropped for CLIENT), `billRate`, `billableHours`, `workType`, `payrollType`, `organizationId` (ADMIN only). |
| `GET /:id` | any | scoped | Single job. 404 if outside caller's org scope. |
| `PATCH /:id` | CLIENT, ADMIN | scoped | Partial update; same `payRate` admin-only rule as create. |
| `GET /:id/pipeline` | any | scoped | Candidates linked to this job (via `Application`), with their per-job `stage`. |
| `GET /:id/description` | any | scoped | Downloads the job description file (`.pdf`/`.docx`). 404 if none on file. |
| `POST /:id/description` | **CLIENT only** (`requireExactRole`) | scoped | `multipart/form-data`, field `jobDescription`, max 10MB. Only the owning client uploads a JD, never SWFS staff. Replaces and deletes any previous file. |
| `DELETE /:id/description` | **CLIENT only** | scoped | Removes the JD file and clears the reference. |

**Internal fields are scoped by role**: every job response is passed through
`scopeJobForRole()` in `job.controller.ts` — for a `CLIENT` caller, `payRate`
is stripped entirely; for `ADMIN`, a computed `grossMargin` (`billRate -
payRate`) is added. This happens regardless of what the repository query
returns, so a client can never see internal cost data via this API.

## Candidates — `/api/candidates`

| Method & path | Role | Org scope | Description |
|---|---|---|---|
| `GET /` | any | ADMIN: all · CLIENT: candidates linked to their org's jobs | List candidates. |
| `POST /` | **ADMIN only** | — | Body: `firstName`, `lastName` (required), `email`, `phone`, `currentTitle`, `currentCompany`, `location`, `skills[]`, `linkedinUrl`, `website`, `source` (`PORTAL`/`LINKEDIN`), `jobId` (optional — links + sets stage `APPLIED` immediately). Only SWFS staff add candidates. |
| `GET /:id` | any | scoped | Single candidate, including `jobLinks[]` and `feedback[]`. |
| `GET /:id/resume` | any | scoped | Downloads the résumé file. |
| `POST /:id/resume` | CLIENT, ADMIN | scoped | `multipart/form-data`, field `resume`, max 10MB, `.pdf`/`.docx` only. Replaces and deletes any previous file. |
| `DELETE /:id/resume` | CLIENT, ADMIN | scoped | Removes the résumé file. |
| `POST /:id/shortlist` | CLIENT, ADMIN | scoped | Body `{ jobId }`. Sets that `Application`'s `stage` to `SHORTLISTED`. |
| `POST /:id/reject` | CLIENT, ADMIN | scoped | Body `{ jobId }`. Sets `stage` to `REJECTED`. |
| `POST /:id/request-interview` | CLIENT, ADMIN | scoped | Body `{ jobId, ...extra }`. Sets `stage` to `INTERVIEW`. |
| `POST /:id/feedback` | CLIENT, ADMIN | scoped | Body `{ feedback, rating? }`. Adds a `CandidateFeedback` row; if `rating` is present it also overwrites `Candidate.clientRating`. |
| `POST /:id/link-job` | CLIENT, ADMIN | scoped | Body `{ jobId }`. Creates an `Application` (stage `APPLIED`) if one doesn't already exist; 400s if the candidate is already linked to that job. |

Every mutating candidate route also writes an `AuditLog` row via
`auditLogService.log(...)` after the change succeeds.

## Organizations — `/api/organization`

| Method & path | Role | Description |
|---|---|---|
| `GET /` | any | The caller's own organization profile (`req.user.organizationId`). |
| `GET /list` | any | ADMIN: every organization · CLIENT: `[own org]` (single-element array, for UI consistency). |
| `POST /scrape` | **ADMIN only** | Body `{ url }`. Fetches a public company page and extracts fields (name, description, social links, etc.) to prefill the "add organization" form. Returns 422 on a handled failure (bad URL, unreachable, SSRF-guard rejection — see `scrape.service.ts`), not a generic 500. |
| `POST /` | **ADMIN only** | Creates an organization. Only `name` is required; a unique `slug` is generated from it (`org_<slugified-name>`, de-duplicated with a numeric suffix). |
| `GET /:id` | any | A specific organization. `CLIENT` gets 403 if `:id` isn't their own. |

## Activity — `/api/activity`

| Method & path | Auth | Org scope | Description |
|---|---|---|---|
| `GET /?limit=50` | ✅ | ADMIN: all · CLIENT: own org | Recent `AuditLog` entries, newest first. |

## Errors

Thrown errors reach `errorHandler` (`middleware/error.middleware.ts`), which
responds `{ success: false, error }` with the error's `statusCode` if set
(e.g. upload-validation errors set 400), else 500 with a generic message
(the real message/stack is only logged server-side). An unmatched route
returns 404 via `notFound`.
