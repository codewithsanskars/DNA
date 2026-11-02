import { AppDataSource } from '../config/data-source';

/**
 * Aggregate queries behind the dashboard charts. Every query takes
 * `org` = null for SWFS admins (all clients) or a client org id, and scopes
 * applications through their job's organization. Raw SQL keeps these to a
 * single round-trip each; all values are bound parameters.
 */
const q = <T = Record<string, unknown>>(sql: string, params: unknown[]) => AppDataSource.query(sql, params) as Promise<T[]>;

// `$1` is always the org id (or null). Appended to queries that join `jobs j`.
const ORG = `($1::uuid IS NULL OR j."organizationId" = $1::uuid)`;

export const insightsRepository = {
  stageCounts: (org: string | null) =>
    q<{ stage: string; count: string }>(
      `SELECT a.stage, COUNT(*) AS count FROM applications a JOIN jobs j ON j.id = a."jobId" WHERE ${ORG} GROUP BY a.stage`,
      [org]
    ),

  /** Weekly series for the last `weeks` weeks: new applications, submissions, hires. */
  weeklyTrend: (org: string | null, weeks: number) =>
    q<{ week: string; added: string; submitted: string; hired: string }>(
      `WITH w AS (
         SELECT generate_series(date_trunc('week', now()) - ($2::int - 1) * interval '1 week', date_trunc('week', now()), interval '1 week') AS week
       ), a AS (
         SELECT a.* FROM applications a JOIN jobs j ON j.id = a."jobId" WHERE ${ORG}
       )
       SELECT to_char(w.week, 'YYYY-MM-DD') AS week,
         (SELECT COUNT(*) FROM a WHERE date_trunc('week', a."appliedAt") = w.week) AS added,
         (SELECT COUNT(*) FROM a WHERE date_trunc('week', a."submittedAt") = w.week) AS submitted,
         (SELECT COUNT(*) FROM a WHERE a.stage = 'HIRED' AND date_trunc('week', a."stageUpdatedAt") = w.week) AS hired
       FROM w ORDER BY w.week`,
      [org, weeks]
    ),

  /** Median days candidates have been sitting in each active stage. */
  timeInStage: (org: string | null) =>
    q<{ stage: string; median_days: string; count: string }>(
      `SELECT a.stage,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM now() - a."stageUpdatedAt") / 86400) AS median_days,
              COUNT(*) AS count
         FROM applications a JOIN jobs j ON j.id = a."jobId"
        WHERE ${ORG} AND a.stage NOT IN ('HIRED', 'REJECTED')
        GROUP BY a.stage`,
      [org]
    ),

  /** Candidate sources among candidates on in-scope roles (each candidate once). */
  sources: (org: string | null) =>
    q<{ source: string; count: string; hired: string }>(
      `SELECT c.source, COUNT(DISTINCT c.id) AS count,
              COUNT(DISTINCT c.id) FILTER (WHERE a.stage = 'HIRED') AS hired
         FROM candidates c
         LEFT JOIN applications a ON a."candidateId" = c.id
         LEFT JOIN jobs j ON j.id = a."jobId"
        WHERE ($1::uuid IS NULL OR j."organizationId" = $1::uuid)
        GROUP BY c.source`,
      [org]
    ),

  rejectionReasons: (org: string | null) =>
    q<{ reason: string | null; count: string }>(
      `SELECT a."rejectionReason" AS reason, COUNT(*) AS count
         FROM applications a JOIN jobs j ON j.id = a."jobId"
        WHERE ${ORG} AND a.stage = 'REJECTED'
        GROUP BY a."rejectionReason"`,
      [org]
    ),

  /** Days from application to hire, for hires in the last 180 days. */
  timeToHire: (org: string | null) =>
    q<{ avg_days: string | null; median_days: string | null; hires: string }>(
      `SELECT AVG(EXTRACT(EPOCH FROM a."stageUpdatedAt" - a."appliedAt") / 86400) AS avg_days,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM a."stageUpdatedAt" - a."appliedAt") / 86400) AS median_days,
              COUNT(*) AS hires
         FROM applications a JOIN jobs j ON j.id = a."jobId"
        WHERE ${ORG} AND a.stage = 'HIRED' AND a."stageUpdatedAt" > now() - interval '180 days'`,
      [org]
    ),

  offerOutcomes: (org: string | null) =>
    q<{ status: string; count: string }>(
      `SELECT o.status, COUNT(*) AS count
         FROM offers o JOIN applications a ON a.id = o."applicationId" JOIN jobs j ON j.id = a."jobId"
        WHERE ${ORG} GROUP BY o.status`,
      [org]
    ),

  /** Active placements with rates and the role's billable hours (for monthly billing). */
  activePlacements: (org: string | null) =>
    q<{ bill: string | null; pay: string | null; hours: string | null; org_id: string; org_name: string }>(
      `SELECT p."billRate" AS bill, p."payRate" AS pay, j."billableHours" AS hours,
              o.id AS org_id, o.name AS org_name
         FROM placements p
         JOIN applications a ON a.id = p."applicationId"
         JOIN jobs j ON j.id = a."jobId"
         JOIN organizations o ON o.id = j."organizationId"
        WHERE ${ORG} AND p.status = 'ACTIVE'`,
      [org]
    ),

  /** Per-client (admin) roll-up: open roles, active pipeline, hires. */
  byClient: () =>
    q<{ id: string; name: string; open_roles: string; pipeline: string; hires: string; submitted: string }>(
      `SELECT o.id, o.name,
              COUNT(DISTINCT j.id) FILTER (WHERE j.status = 'OPEN') AS open_roles,
              COUNT(a.id) FILTER (WHERE a.stage NOT IN ('HIRED', 'REJECTED')) AS pipeline,
              COUNT(a.id) FILTER (WHERE a.stage = 'HIRED') AS hires,
              COUNT(a.id) FILTER (WHERE a."submittedAt" IS NOT NULL) AS submitted
         FROM organizations o
         JOIN jobs j ON j."organizationId" = o.id
         LEFT JOIN applications a ON a."jobId" = j.id
        GROUP BY o.id, o.name
        ORDER BY pipeline DESC, open_roles DESC
        LIMIT 8`,
      []
    ),

  /** Per-role (client) roll-up for their own open roles. */
  byRole: (org: string) =>
    q<{ id: string; title: string; pipeline: string; hires: string; submitted: string; days_open: string }>(
      `SELECT j.id, j.title,
              COUNT(a.id) FILTER (WHERE a.stage NOT IN ('HIRED', 'REJECTED')) AS pipeline,
              COUNT(a.id) FILTER (WHERE a.stage = 'HIRED') AS hires,
              COUNT(a.id) FILTER (WHERE a."submittedAt" IS NOT NULL) AS submitted,
              EXTRACT(DAY FROM now() - COALESCE(j."openedAt", j."createdAt")) AS days_open
         FROM jobs j LEFT JOIN applications a ON a."jobId" = j.id
        WHERE j."organizationId" = $1::uuid AND j.status = 'OPEN'
        GROUP BY j.id, j.title, j."openedAt", j."createdAt"
        ORDER BY pipeline DESC
        LIMIT 8`,
      [org]
    ),

  roleCounts: (org: string | null) =>
    q<{ open: string; high: string; on_hold: string }>(
      `SELECT COUNT(*) FILTER (WHERE j.status = 'OPEN') AS open,
              COUNT(*) FILTER (WHERE j.status = 'OPEN' AND j.priority = 'HIGH') AS high,
              COUNT(*) FILTER (WHERE j.status = 'ON_HOLD') AS on_hold
         FROM jobs j WHERE ${ORG}`,
      [org]
    ),

  upcomingInterviewCount: (org: string | null) =>
    q<{ count: string }>(
      `SELECT COUNT(*) AS count FROM interviews i
         JOIN applications a ON a.id = i."applicationId" JOIN jobs j ON j.id = a."jobId"
        WHERE ${ORG} AND i.status = 'SCHEDULED' AND i."scheduledAt" BETWEEN now() AND now() + interval '7 days'`,
      [org]
    ),
};
