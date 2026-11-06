import { AppDataSource } from '../config/data-source';

/**
 * Read-only queries behind the daily recruiter digest. Each returns a short,
 * capped list so the digest stays scannable. `ownerId` = null means the whole
 * team; otherwise "mine" = roles or candidates the recruiter owns.
 */

const q = <T = any>(sql: string, params: unknown[]) => AppDataSource.query(sql, params) as Promise<T[]>;

const ACTIVE_STAGES = ['APPLIED', 'SCREENING', 'SUBMITTED', 'SHORTLISTED', 'INTERVIEW', 'OFFER'];

// Base join for application-level items + the "mine" filter on $1.
const APP_FROM = `
  FROM applications a
  JOIN jobs j ON j.id = a."jobId"
  JOIN candidates c ON c.id = a."candidateId"
  LEFT JOIN organizations o ON o.id = j."organizationId"`;
const MINE = `($1::uuid IS NULL OR j."ownerId" = $1::uuid OR c."ownerId" = $1::uuid)`;
const APP_COLS = `
  a.id AS "applicationId", a.stage, a."stageUpdatedAt",
  c.id AS "candidateId", c."firstName", c."lastName",
  j.id AS "jobId", j.title AS "jobTitle", o.name AS "organizationName"`;

export const digestRepository = {
  interviewsToday: (ownerId: string | null, dayStart: Date, dayEnd: Date) =>
    q(
      `SELECT ${APP_COLS}, i.id AS "interviewId", i."scheduledAt", i.round, i.mode
       FROM interviews i
       JOIN applications a ON a.id = i."applicationId"
       JOIN jobs j ON j.id = a."jobId"
       JOIN candidates c ON c.id = a."candidateId"
       LEFT JOIN organizations o ON o.id = j."organizationId"
       WHERE i.status = 'SCHEDULED' AND i."scheduledAt" >= $2 AND i."scheduledAt" < $3 AND ${MINE}
       ORDER BY i."scheduledAt" ASC LIMIT 12`,
      [ownerId, dayStart, dayEnd]
    ),

  /** Interviews in the last 14 days that happened but have no scorecard for that round. */
  feedbackMissing: (ownerId: string | null) =>
    q(
      `SELECT ${APP_COLS}, i.id AS "interviewId", i."scheduledAt", i.round, i.status AS "interviewStatus"
       FROM interviews i
       JOIN applications a ON a.id = i."applicationId"
       JOIN jobs j ON j.id = a."jobId"
       JOIN candidates c ON c.id = a."candidateId"
       LEFT JOIN organizations o ON o.id = j."organizationId"
       WHERE i.status IN ('SCHEDULED', 'COMPLETED')
         AND i."scheduledAt" < now() AND i."scheduledAt" > now() - interval '14 days'
         AND a.stage NOT IN ('REJECTED', 'HIRED')
         AND NOT EXISTS (SELECT 1 FROM interview_scorecards s WHERE s."applicationId" = a.id AND s.round = i.round)
         AND ${MINE}
       ORDER BY i."scheduledAt" ASC LIMIT 10`,
      [ownerId]
    ),

  /** Open tasks due before the end of today. Team scope = everyone's. */
  tasksDue: (userId: string | null, dayEnd: Date) =>
    q(
      `SELECT t.id, t.title, t."dueAt", t.priority, t."recordType", t."recordId", u.name AS "assigneeName"
       FROM tasks t LEFT JOIN users u ON u.id = t."assigneeId"
       WHERE t.status = 'OPEN' AND t."dueAt" IS NOT NULL AND t."dueAt" < $2
         AND ($1::uuid IS NULL OR t."assigneeId" = $1::uuid)
       ORDER BY t."dueAt" ASC LIMIT 12`,
      [userId, dayEnd]
    ),

  /** Submitted 3+ days ago and the client hasn't moved them. */
  awaitingClient: (ownerId: string | null) =>
    q(
      `SELECT ${APP_COLS}, a."submittedAt", a."clientViewedAt"
       ${APP_FROM}
       WHERE a.stage = 'SUBMITTED' AND a."submittedAt" < now() - interval '3 days' AND j.status = 'OPEN' AND ${MINE}
       ORDER BY a."submittedAt" ASC LIMIT 10`,
      [ownerId]
    ),

  /** Candidates sitting in a stage longer than that stage should take. */
  stalePipeline: (ownerId: string | null) =>
    q(
      `SELECT ${APP_COLS}, EXTRACT(DAY FROM now() - a."stageUpdatedAt")::int AS "daysInStage"
       ${APP_FROM}
       WHERE j.status = 'OPEN' AND ${MINE} AND (
            (a.stage IN ('APPLIED', 'SCREENING') AND a."stageUpdatedAt" < now() - interval '5 days')
         OR (a.stage = 'SHORTLISTED' AND a."stageUpdatedAt" < now() - interval '5 days')
         OR (a.stage = 'INTERVIEW' AND a."stageUpdatedAt" < now() - interval '10 days')
         OR (a.stage = 'OFFER' AND a."stageUpdatedAt" < now() - interval '5 days'))
       ORDER BY a."stageUpdatedAt" ASC LIMIT 10`,
      [ownerId]
    ),

  /** Open 7+ days with no submission in the last 7 days. */
  rolesAtRisk: (ownerId: string | null) =>
    q(
      `SELECT j.id AS "jobId", j.title AS "jobTitle", j.priority, j."totalCandidates", o.name AS "organizationName",
              EXTRACT(DAY FROM now() - COALESCE(j."openedAt", j."createdAt"))::int AS "daysOpen",
              (SELECT max(a."submittedAt") FROM applications a WHERE a."jobId" = j.id) AS "lastSubmittedAt"
       FROM jobs j LEFT JOIN organizations o ON o.id = j."organizationId"
       WHERE j.status = 'OPEN'
         AND COALESCE(j."openedAt", j."createdAt") < now() - interval '7 days'
         AND NOT EXISTS (SELECT 1 FROM applications a WHERE a."jobId" = j.id AND a."submittedAt" > now() - interval '7 days')
         AND ($1::uuid IS NULL OR j."ownerId" = $1::uuid)
       ORDER BY CASE j.priority WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END, "daysOpen" DESC
       LIMIT 6`,
      [ownerId]
    ),

  /** Candidates in an active pipeline nobody has contacted in 14+ days. */
  followUps: (ownerId: string | null) =>
    q(
      `SELECT DISTINCT ON (c.id) c.id AS "candidateId", c."firstName", c."lastName", c."lastContactedAt",
              j.title AS "jobTitle", a.stage
       ${APP_FROM}
       WHERE a.stage = ANY($2) AND j.status = 'OPEN'
         AND (c."lastContactedAt" IS NULL OR c."lastContactedAt" < now() - interval '14 days')
         AND ($1::uuid IS NULL OR c."ownerId" = $1::uuid)
       ORDER BY c.id, c."lastContactedAt" ASC NULLS FIRST LIMIT 8`,
      [ownerId, ACTIVE_STAGES]
    ),

  /** Offers and hires since `since`. */
  wins: (ownerId: string | null, since: Date) =>
    q(
      `SELECT ${APP_COLS}
       ${APP_FROM}
       WHERE a.stage IN ('OFFER', 'HIRED') AND a."stageUpdatedAt" >= $2 AND ${MINE}
       ORDER BY a."stageUpdatedAt" DESC LIMIT 8`,
      [ownerId, since]
    ),

  /** Roles opened since `since` (team-wide: anyone can start sourcing). */
  newRoles: (since: Date) =>
    q(
      `SELECT j.id AS "jobId", j.title AS "jobTitle", j.priority, o.name AS "organizationName", u.name AS "ownerName"
       FROM jobs j LEFT JOIN organizations o ON o.id = j."organizationId" LEFT JOIN users u ON u.id = j."ownerId"
       WHERE j.status = 'OPEN' AND j."createdAt" >= $1
       ORDER BY j."createdAt" DESC LIMIT 6`,
      [since]
    ),
};
