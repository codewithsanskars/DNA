import { AuthenticatedRequest } from '../types';
import { isAdminRole } from './roles';

/** An Error the error middleware turns into `{ status, error: message }`. */
export function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

export const badRequest = (message: string) => httpError(400, message);
export const notFound = (message = 'Not found') => httpError(404, message);
export const forbidden = (message = 'Insufficient permissions') => httpError(403, message);

/**
 * The organization a request is scoped to: null for SWFS admins (every
 * client), the caller's own org for CLIENT users.
 */
export function orgScopeOf(req: AuthenticatedRequest): string | null {
  return isAdminRole(req.user!.role) ? null : req.user!.organizationId;
}

export function isAdminRequest(req: AuthenticatedRequest): boolean {
  return isAdminRole(req.user!.role);
}

// ---------------------------------------------------------------------------
// Body parsers — each returns undefined for "not provided" and throws a 400
// for a present-but-invalid value, so controllers can pass results straight
// through to partial updates.
// ---------------------------------------------------------------------------

export function optionalString(value: unknown, label: string, max = 5000): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw badRequest(`${label} must be text`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw badRequest(`${label} must be ${max} characters or fewer`);
  return trimmed;
}

export function requiredString(value: unknown, label: string, max = 5000): string {
  const s = optionalString(value, label, max);
  if (!s) throw badRequest(`${label} is required`);
  return s;
}

export function optionalNumber(value: unknown, label: string, opts: { min?: number; max?: number; integer?: boolean } = {}): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) throw badRequest(`${label} must be a number`);
  if (opts.integer && !Number.isInteger(num)) throw badRequest(`${label} must be a whole number`);
  if (opts.min !== undefined && num < opts.min) throw badRequest(`${label} must be at least ${opts.min}`);
  if (opts.max !== undefined && num > opts.max) throw badRequest(`${label} must be at most ${opts.max}`);
  return num;
}

/** ISO date (YYYY-MM-DD) or full timestamp; null clears. */
export function optionalDate(value: unknown, label: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) throw badRequest(`${label} must be a valid date`);
  return String(value);
}

export function optionalEnum<T extends string>(value: unknown, allowed: readonly T[], label: string): T | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (!allowed.includes(value as T)) throw badRequest(`${label} must be one of: ${allowed.join(', ')}`);
  return value as T;
}

export function optionalStringArray(value: unknown, label: string, maxItems = 200): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  const list = typeof value === 'string' ? value.split(',') : value;
  if (!Array.isArray(list)) throw badRequest(`${label} must be a list`);
  if (list.length > maxItems) throw badRequest(`${label} can have at most ${maxItems} entries`);
  const cleaned = list.map((v) => String(v).trim()).filter(Boolean);
  return [...new Set(cleaned)];
}

export function optionalUuid(value: unknown, label: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const s = String(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) throw badRequest(`${label} is not a valid id`);
  return s;
}
