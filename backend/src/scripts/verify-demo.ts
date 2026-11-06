/**
 * Verifies the demo dataset covers every enum value and every feature
 * scenario. Run after `seed:demo`:
 *
 *   npm --prefix backend run verify:demo
 */
import 'reflect-metadata';
import { AppDataSource } from '../config/data-source';
import * as E from '../entities/enums';
import { digestService } from '../services/digest.service';
import { notificationRepository } from '../repositories/notification.repository';

(async () => {
  (AppDataSource.options as any).logging = false;
  await AppDataSource.initialize();
  const q = (s: string) => AppDataSource.query(s);
  let fails = 0;

  const enumChecks: [string, string, string, readonly string[]][] = [
    ['applications', 'stage', 'Candidate stages', E.CANDIDATE_STAGES],
    ['candidates', 'source', 'Sources', E.CANDIDATE_SOURCES],
    ['candidates', '"globalStatus"', 'Global statuses', E.GLOBAL_STATUSES],
    ['candidates', 'status', 'Candidate sub-statuses', ['LOOKING', 'SELECTED', 'COMPANY', 'SWFS', 'BLACKLISTED', 'OPPORTUNITY', 'OFFBOARDED', 'NOT_INTERESTED', 'CONTACTED']],
    ['candidates', '"workAuthorization"', 'Work authorizations', E.WORK_AUTHORIZATIONS],
    ['applications', '"rejectionReason"', 'Rejection reasons', E.REJECTION_REASONS],
    ['jobs', 'status', 'Job statuses', E.JOB_STATUSES],
    ['jobs', 'priority', 'Job priorities', E.JOB_PRIORITIES],
    ['jobs', '"workType"', 'Work types', E.WORK_TYPES],
    ['jobs', '"payrollType"', 'Payroll types', E.PAYROLL_TYPES],
    ['interviews', 'mode', 'Interview modes', E.INTERVIEW_MODES],
    ['interviews', 'status', 'Interview statuses', E.INTERVIEW_STATUSES],
    ['interview_scorecards', 'recommendation', 'Scorecard recommendations', E.SCORECARD_RECOMMENDATIONS],
    ['interview_scorecards', '"authorRole"', 'Scorecard author roles', E.USER_ROLES],
    ['offers', 'status', 'Offer statuses', E.OFFER_STATUSES],
    ['offers', '"rateType"', 'Offer rate types', E.OFFER_RATE_TYPES],
    ['placements', 'status', 'Placement statuses', E.PLACEMENT_STATUSES],
    ['record_notes', 'kind', 'Note kinds', E.NOTE_KINDS],
    ['record_notes', '"recordType"', 'Note record types', E.RECORD_TYPES],
    ['tasks', 'priority', 'Task priorities', E.TASK_PRIORITIES],
    ['tasks', 'status', 'Task statuses', E.TASK_STATUSES],
    ['tasks', 'recurrence', 'Task recurrences', E.TASK_RECURRENCES],
    ['organization_memberships', 'role', 'User roles', E.USER_ROLES],
    ['candidates', '"ctcCurrency"', 'Currencies', ['USD', 'INR', 'EUR', 'GBP', 'CAD']],
  ];
  for (const [t, c, label, expected] of enumChecks) {
    const have = new Set((await q(`SELECT DISTINCT ${c} AS v FROM ${t}`)).map((r: any) => String(r.v)));
    const missing = expected.filter((v) => !have.has(v));
    if (missing.length) fails++;
    console.log(`${missing.length ? 'MISSING' : 'OK     '} ${label}: ${missing.length ? missing.join(', ') : `${expected.length}/${expected.length}`}`);
  }

  const scenarios: [string, string][] = [
    ['Submitted and never opened (client "New")', `SELECT COUNT(*) n FROM applications WHERE stage='SUBMITTED' AND "clientViewedAt" IS NULL`],
    ['Submitted 5+ days ago, still waiting', `SELECT COUNT(*) n FROM applications WHERE stage='SUBMITTED' AND "submittedAt" < now()-interval '5 days'`],
    ['Interview today', `SELECT COUNT(*) n FROM interviews WHERE status='SCHEDULED' AND "scheduledAt"::date = now()::date`],
    ['Interview tomorrow', `SELECT COUNT(*) n FROM interviews WHERE status='SCHEDULED' AND "scheduledAt"::date = (now()+interval '1 day')::date`],
    ['Past interview with no scorecard', `SELECT COUNT(*) n FROM interviews i WHERE i."scheduledAt" < now() AND i.status IN ('SCHEDULED','COMPLETED') AND NOT EXISTS (SELECT 1 FROM interview_scorecards s WHERE s."applicationId"=i."applicationId" AND s.round=i.round)`],
    ['Offer expiring within 3 days', `SELECT COUNT(*) n FROM offers WHERE status='EXTENDED' AND "expiresAt" BETWEEN now()::date AND now()::date+3`],
    ['Offer already expired', `SELECT COUNT(*) n FROM offers WHERE status='EXTENDED' AND "expiresAt" < now()::date`],
    ['Hire in the last 24h (digest wins)', `SELECT COUNT(*) n FROM applications WHERE stage='HIRED' AND "stageUpdatedAt" > now()-interval '1 day'`],
    ['Roles opened in the last 2 days', `SELECT COUNT(*) n FROM jobs WHERE "createdAt" > now()-interval '2 days'`],
    ['Unassigned open role', `SELECT COUNT(*) n FROM jobs WHERE "ownerId" IS NULL AND status='OPEN'`],
    ['Roles not yet AI-analysed', `SELECT COUNT(*) n FROM jobs WHERE "aiRequirements" IS NULL`],
    ['Role with an attached JD file', `SELECT COUNT(*) n FROM jobs WHERE "jdUrl" IS NOT NULL`],
    ['Candidate on two clients roles', `SELECT COUNT(*) n FROM (SELECT a."candidateId" FROM applications a JOIN jobs j ON j.id=a."jobId" GROUP BY 1 HAVING COUNT(DISTINCT j."organizationId")>1) x`],
    ['Duplicate candidate pairs', `SELECT COUNT(*) n FROM candidates a JOIN candidates b ON a.id<b.id AND (lower(a.email)=lower(b.email) OR a.phone=b.phone)`],
    ['Candidates with no email', `SELECT COUNT(*) n FROM candidates WHERE email IS NULL`],
    ['Certification expiring within 30 days', `SELECT COUNT(*) n FROM candidates, jsonb_array_elements(certifications) c WHERE (c->>'expiresAt')::date BETWEEN now()::date AND now()::date+30`],
    ['Certification expired', `SELECT COUNT(*) n FROM candidates, jsonb_array_elements(certifications) c WHERE (c->>'expiresAt')::date < now()::date`],
    ['Candidates with a résumé file', `SELECT COUNT(*) n FROM candidates WHERE "resumeUrl" IS NOT NULL`],
    ['Candidates with a photo', `SELECT COUNT(*) n FROM candidates WHERE "photoUrl" IS NOT NULL`],
    ['Talent-pool candidates on no role', `SELECT COUNT(*) n FROM candidates c WHERE NOT EXISTS (SELECT 1 FROM applications a WHERE a."candidateId"=c.id)`],
    ['Client with no roles', `SELECT COUNT(*) n FROM organizations o WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j."organizationId"=o.id)`],
    ['Inactive organization', `SELECT COUNT(*) n FROM organizations WHERE "isActive"=false`],
    ['Notes with @mentions', `SELECT COUNT(*) n FROM record_notes WHERE cardinality(mentions)>0`],
    ['Overdue open tasks', `SELECT COUNT(*) n FROM tasks WHERE status='OPEN' AND "dueAt" < now()`],
    ['Unread notifications', `SELECT COUNT(*) n FROM notifications WHERE "readAt" IS NULL`],
    ['Active placements with bill + pay rates', `SELECT COUNT(*) n FROM placements WHERE status='ACTIVE' AND "billRate" IS NOT NULL AND "payRate" IS NOT NULL`],
    ['Client feedback comments', `SELECT COUNT(*) n FROM candidate_feedback WHERE "authorRole"='CLIENT'`],
    ['Legacy interview feedback', `SELECT COUNT(*) n FROM interview_feedback`],
    ['Saved searches', `SELECT COUNT(*) n FROM saved_searches`],
  ];
  for (const [label, sql] of scenarios) {
    const n = Number((await q(sql))[0].n);
    if (!n) fails++;
    console.log(`${n ? 'OK     ' : 'MISSING'} ${label}: ${n}`);
  }

  const staff = await notificationRepository.staffIds();
  const d = await digestService.build(staff[0], 'team', { ai: false, refresh: true });
  const empty = d.sections.filter((s) => !s.items.length).map((s) => s.title);
  if (empty.length) fails++;
  console.log(`${empty.length ? 'MISSING' : 'OK     '} Daily digest (team), every section filled: ${JSON.stringify(d.counts)}${empty.length ? ` EMPTY: ${empty.join(', ')}` : ''}`);

  console.log(fails ? `\n${fails} coverage gap(s)` : '\nFULL COVERAGE');
  await AppDataSource.destroy();
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error('FAILED', e);
  process.exit(1);
});
