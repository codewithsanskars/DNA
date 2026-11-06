import { CandidateStage } from '../types';

/**
 * Which applications a CLIENT may see (decided November 2026, roadmap fix F3).
 *
 * Clients see a candidate on their role only once SWFS has presented them:
 *  - the application is at Submitted or a later stage, or
 *  - it was rejected *after* being submitted.
 * Applied / Screening (SWFS's own sourcing and vetting) stay internal, and so
 * do candidates SWFS rejected before ever submitting them.
 *
 * `submittedAt` is stamped whenever an application first reaches a
 * client-visible stage (see `submissionStamp`), so a client's own rejection
 * keeps the candidate visible to them. Moving an application back to Applied /
 * Screening withdraws it from the client again.
 *
 * Every client-scoped query uses `clientVisibleSql`; DTO-level filtering
 * (the redact middleware) uses `isClientVisible`. Keep the two in step.
 */
export const CLIENT_VISIBLE_STAGES: CandidateStage[] = ['SUBMITTED', 'INTERVIEW', 'SHORTLISTED', 'OFFER', 'HIRED'];
const PRE_SUBMISSION: CandidateStage[] = ['APPLIED', 'SCREENING'];

const inList = CLIENT_VISIBLE_STAGES.map((s) => `'${s}'`).join(', ');

/** SQL predicate on an `applications` alias. */
export const clientVisibleSql = (alias = 'a') =>
  `(${alias}.stage IN (${inList}) OR (${alias}.stage = 'REJECTED' AND ${alias}."submittedAt" IS NOT NULL))`;

export const isClientVisible = (a: { stage?: string; submittedAt?: Date | string | null }) =>
  CLIENT_VISIBLE_STAGES.includes(a.stage as CandidateStage) || (a.stage === 'REJECTED' && !!a.submittedAt);

/**
 * Extra columns to write when an application moves to `next`, keeping
 * `submittedAt` consistent with the rule above. `current` is the row as it is
 * now (omit for a brand-new link).
 *  - Back to Applied / Screening: withdrawn from the client.
 *  - Into a client-visible stage: stamped if it never was.
 *  - Rejected from a stage the client could see: stamped too, so the client
 *    keeps seeing it (covers rows from before `submittedAt` existed).
 */
export function submissionStamp(
  next: CandidateStage,
  current?: { stage?: string | null; submittedAt?: Date | null } | null
): { submittedAt?: Date | null; clientViewedAt?: null } {
  if (PRE_SUBMISSION.includes(next)) return { submittedAt: null, clientViewedAt: null };
  if (current?.submittedAt) return {};
  const wasVisible = !!current && CLIENT_VISIBLE_STAGES.includes(current.stage as CandidateStage);
  if (CLIENT_VISIBLE_STAGES.includes(next) || (next === 'REJECTED' && wasVisible)) return { submittedAt: new Date() };
  return {};
}
