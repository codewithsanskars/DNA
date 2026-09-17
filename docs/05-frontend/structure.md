# Frontend structure

`frontend/src/`, a Vite + React 18 + TypeScript SPA styled with Tailwind.

```
src/
├── main.tsx            # ReactDOM root, wraps <App/> in StrictMode
├── App.tsx             # providers, QueryClient, routes
├── index.css            # Tailwind entrypoint
├── api/                 # one file per backend resource + shared axios instance
├── components/
│   ├── layout/          # app shell: AppLayout, Header, Sidebar, UserMenu, NotificationBell
│   ├── shared/           # design-system primitives (Button, Modal, Table, Toast, Confirm…)
│   ├── auth/             # LoginSplash, OktaRegisterModal
│   └── jobs/              # JobDetailModal
├── context/              # AuthContext, ThemeContext
├── hooks/                # TanStack Query hooks (useJobs, useCandidates, useOrganizations, useReorderable)
├── pages/                # one component per route
├── types/                # TS types mirroring backend API shapes
└── utils/                 # format.ts, roles.ts
```

## Routing (`App.tsx`)

`react-router-dom`'s `BrowserRouter`, with three route guard patterns:

- **`PrivateRoute`** — redirects to `/login` if `useAuth().user` is null.
- **`AdminRoute`** — same, plus redirects `CLIENT` users to `/dashboard`.
  Used for `/search` and `/organization*` — client-facing routes never
  render for a non-admin, even by typing the URL directly (the backend
  still enforces this independently — this is a UX guard, not the security
  boundary).
- `/login` and `/auth/callback` redirect *away* to `/dashboard` once a user
  is present.

| Path | Guard | Page |
|---|---|---|
| `/login` | — | `LoginPage` |
| `/auth/callback` | — | `LoginPage` (renders while `AuthContext` processes the Okta redirect) |
| `/dashboard` | Private | `DashboardPage` |
| `/jobs` | Private | `JobsPage` |
| `/jobs/:id` | Private | `CandidatesPage` (pipeline view for one job) |
| `/candidates` | Private | `CandidatesPage` |
| `/candidates/:id` | Private | `CandidateDetailPage` |
| `/search` | Admin | `SearchPage` |
| `/organization` | Admin | `OrganizationPage` (client roster) |
| `/organization/:id` | Admin | `OrganizationDetailPage` |
| `/activity` | Private | `ActivityPage` |
| `/settings` | Private | `SettingsPage` |
| `*` | — | redirects to `/dashboard` |

## API layer (`api/`)

`api/axios.ts` exports a single configured `axios` instance:
- `baseURL: '/api'` (Vite dev proxy forwards this to the backend; see
  [setup.md](../03-setup.md)).
- Request interceptor attaches `Authorization: Bearer <token>` from
  `localStorage['swfs_token']`.
- Response interceptor: on `401`, clears the stored token and hard-redirects
  to `/login`.

Each resource file (`job.api.ts`, `candidate.api.ts`, `organization.api.ts`,
`dashboard.api.ts`, `activity.api.ts`, `auth.api.ts`) wraps that instance
with typed methods returning the unwrapped `data` (i.e. callers never see
the `{ success, data }` envelope — see
[api-reference.md](../04-backend/api-reference.md)). File-download endpoints
(e.g. `jobApi.getJobDescriptionBlob`) fetch with `responseType: 'blob'` and
build a client-side object URL, because a plain `<a href>` can't carry the
`Authorization` header these routes require.

## Data fetching (`hooks/`, `api/queryKeys.ts`)

TanStack Query throughout — no other client-state cache. `queryKeys.ts` is
the single source of truth for cache keys (`jobs`, `jobPipeline(jobId)`,
`candidates`, `candidate(id)`, `organizations`, `organization(id)`,
`dashboard`, `activity`), so a query and its invalidation can never drift
apart. Each `hooks/use*.ts` file is a thin `useQuery`/`useMutation` wrapper
over the matching `api/*.ts` file. `QueryClient` defaults: `retry: 1`,
`staleTime: 30_000` (`App.tsx`).

## Auth state (`context/AuthContext.tsx`)

Holds `user`, `token`, `isLoading`, plus two flows described in
[auth-and-security.md](../04-backend/auth-and-security.md):
- `justSignedIn` — true for a moment right after a fresh sign-in (not a
  resumed session), drives the post-login splash animation
  (`LoginSplash`).
- `pendingOktaRegistration` — set when the Okta callback lands on
  `/auth/callback?register=1&...` for a first-time identity; drives
  `OktaRegisterModal`, which calls `completeOktaRegistration(orgName)`.

On mount, if a token is in `localStorage`, it calls `authApi.me()` to
resume the session (clearing the token on failure). It also inspects
`window.location.pathname === '/auth/callback'` directly (rather than via a
route param) to pull `?token=` or `?register=1&pendingToken=...` out of the
URL once, then cleans the URL with `history.replaceState`.

## Components

- **`components/layout/`** — `AppLayout` (sidebar + header shell every
  private page renders inside), `Sidebar` (nav, role-aware — hides
  admin-only links for `CLIENT`), `Header`, `UserMenu`, `NotificationBell`.
- **`components/shared/`** — the design-system layer: `Button`, `Card`,
  `Modal`, `Table`, `Field`, `Badge`, `Avatar`, `Icon`, `LoadingSpinner`,
  `States` (empty/error states), and two provider+hook pairs mounted in
  `App.tsx`: `ToastProvider`/`useToast` and `ConfirmProvider`/`useConfirm`
  (promise-based confirm dialogs, replacing `window.confirm`).
- **`components/jobs/JobDetailModal.tsx`** and **`components/auth/`** —
  feature-specific components used by exactly one or two pages.

## Types (`types/index.ts`)

Hand-written TypeScript types mirroring the backend's DTO shapes (not the
raw TypeORM entities — see
[data-model.md](../04-backend/data-model.md#api-vs-entity-shape)). When a
backend response shape changes, update this file to match; nothing
generates it automatically.
