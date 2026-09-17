# State management

Beyond routing and the query cache (covered in
[structure.md](structure.md#routing-apptsx) and
[structure.md](structure.md#data-fetching-hooks-apiquerykeysts)), the
frontend has three other state mechanisms worth knowing about.

## Server state: TanStack Query only

There is no Redux/Zustand/global store for server data — every list/detail
view is a `useQuery` hook keyed via `api/queryKeys.ts`, and every mutation
invalidates the relevant key(s) on success. If you add a new resource,
follow the existing pattern: add its API wrapper under `api/`, add its
key(s) to `queryKeys.ts`, and add a `hooks/use<Resource>.ts` file — don't
reach for a new state library.

## Two React Contexts

- **`AuthContext`** — the session: `user`, `token`, login/logout, and the
  Okta-callback handling described in
  [structure.md](structure.md#auth-state-contextauthcontexttsx). This is
  the only source of truth for "who is logged in" — components read it via
  `useAuth()`, never `localStorage` directly (except `AuthContext` and
  `api/axios.ts` themselves).
- **`ThemeContext`** — `'dark' | 'light'`, persisted to
  `localStorage['swfs_theme']` (default `'dark'`), applied by toggling a
  `dark` class on `document.documentElement` (Tailwind's `dark:` variant
  convention).

## Per-viewer UI state: `localStorage`, not a context

`hooks/useReorderable.ts` is the pattern for state that's per-browser and
doesn't need to be shared or synced with the server: the dashboard's
drag-to-reorder widget order (`DragWidget` + `DashboardPage`) is read from
and written straight to `localStorage` under a caller-supplied key, with no
context or query involved. It supports both a real HTML5 drag gesture and
an arrow-button fallback (`move(item, direction)`) for touch/keyboard, and
silently no-ops if `localStorage` is unavailable (private browsing, quota).
If you need similar "remember what the user did last time, per device"
state elsewhere, follow this hook's shape rather than adding it to
`AuthContext` or a query.
