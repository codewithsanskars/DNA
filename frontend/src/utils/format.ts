/**
 * Display formatting helpers shared across pages. Pure functions, no imports —
 * safe to use from components, hooks, or other utils without cycle risk.
 */

/** `SHORTLISTED` / `request_interview` -> `Shortlisted` / `Request Interview`. */
export function humanize(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/(^|\s)\w/g, (c) => c.toUpperCase());
}

/** Locale date, no time: `10/1/2024`. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

/** Locale date + time, medium/short: `Oct 1, 2024, 3:45 PM`. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Raw locale date + time: `10/1/2024, 3:45:12 PM`. */
export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

/** Coarse relative time: `just now`, `5m ago`, `3h ago`, `2d ago`. */
export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Hourly rate: `$85.00/hr`. */
export function formatRate(value?: number): string {
  if (value === undefined || value === null) return '—';
  return `$${value.toFixed(2)}/hr`;
}

/** First initial of a name or email, uppercased. Falls back to `?`. */
export function initials(nameOrEmail?: string | null): string {
  return (nameOrEmail || '?').charAt(0).toUpperCase();
}
