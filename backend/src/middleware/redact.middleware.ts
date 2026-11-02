import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { isAdminRole } from '../utils/roles';
import { CLIENT_HIDDEN_CANDIDATE_FIELDS } from '../utils/candidateFields';

/**
 * For CLIENT callers, strips SWFS-internal candidate fields (compensation,
 * tags, owner, last-contacted) from any candidate DTO in the JSON response —
 * at any depth, so lists, single records and `{ items }` pages are all
 * covered. A candidate DTO is recognised by having both `firstName` and
 * `jobLinks`. Mounting this on a router means no individual handler can
 * forget to redact.
 */
export function redactCandidatesForClient(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user || isAdminRole(req.user.role)) {
    next();
    return;
  }
  const json = res.json.bind(res);
  res.json = (body: unknown) => json(redact(body));
  next();
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Date) return value;
  const obj = { ...(value as Record<string, unknown>) };
  if ('firstName' in obj && 'jobLinks' in obj) {
    for (const key of CLIENT_HIDDEN_CANDIDATE_FIELDS) delete obj[key];
  }
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') obj[k] = redact(v, depth + 1);
  }
  return obj;
}
