import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { isAdminRole } from '../utils/roles';
import { CLIENT_HIDDEN_CANDIDATE_FIELDS } from '../utils/candidateFields';
import { AppDataSource } from '../config/data-source';
import { isClientVisible } from '../utils/clientVisibility';

/**
 * For CLIENT callers, removes from any candidate DTO in the JSON response
 * (at any depth, so lists, single records and `{ items }` pages are all
 * covered):
 *  - SWFS-internal fields (compensation, tags, owner, last-contacted);
 *  - links to **other clients'** roles: a candidate can be in several
 *    clients' pipelines, and one client must never learn about another's
 *    roles, stages or interview feedback;
 *  - links to their own roles that SWFS hasn't submitted yet (Applied /
 *    Screening, or rejected before submission — see utils/clientVisibility);
 *  - comments that **another client's** users left on the candidate.
 * A candidate DTO is recognised by having both `firstName` and `jobLinks`.
 * Mounting this on a router means no individual handler can forget to redact.
 */
export function redactCandidatesForClient(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user || isAdminRole(req.user.role)) {
    next();
    return;
  }
  const orgId = req.user.organizationId;
  const json = res.json.bind(res);
  let ownClientEmails: Set<string> | null = null;
  // Resolved before the handler runs, so redaction itself stays synchronous.
  clientEmailsOf(orgId)
    .then((emails) => {
      ownClientEmails = emails;
    })
    .catch(() => {
      ownClientEmails = new Set(); // fail closed: hide all client-authored comments
    })
    .finally(() => {
      res.json = (body: unknown) => json(redact(body, orgId, ownClientEmails ?? new Set()));
      next();
    });
}

async function clientEmailsOf(orgId: string): Promise<Set<string>> {
  if (!AppDataSource.isInitialized) return new Set();
  const rows: { email: string }[] = await AppDataSource.query(
    `SELECT lower(u.email) AS email FROM organization_memberships m JOIN users u ON u.id = m."userId"
      WHERE m."organizationId" = $1 AND m.role = 'CLIENT'`,
    [orgId]
  );
  return new Set(rows.map((r) => r.email));
}

function redact(value: unknown, orgId: string, ownEmails: Set<string>, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, orgId, ownEmails, depth + 1));
  if (value instanceof Date) return value;
  const obj = { ...(value as Record<string, unknown>) };
  if ('firstName' in obj && 'jobLinks' in obj) {
    for (const key of CLIENT_HIDDEN_CANDIDATE_FIELDS) delete obj[key];
    if (Array.isArray(obj.jobLinks)) {
      obj.jobLinks = (obj.jobLinks as { organizationId?: string; stage?: string; submittedAt?: Date | string | null }[]).filter(
        (l) => l.organizationId === orgId && isClientVisible(l)
      );
    }
    if (Array.isArray(obj.feedback)) {
      obj.feedback = (obj.feedback as { authorRole?: string; author?: string }[]).filter(
        (f) => f.authorRole !== 'CLIENT' || ownEmails.has(String(f.author ?? '').toLowerCase())
      );
    }
  }
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') obj[k] = redact(v, orgId, ownEmails, depth + 1);
  }
  return obj;
}
