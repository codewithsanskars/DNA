import { notificationRepository, NewNotification } from '../repositories/notification.repository';
import { candidateRepository } from '../repositories/candidate.repository';
import { jobRepository } from '../repositories/job.repository';
import { pipelineRepository } from '../repositories/pipeline.repository';
import { workflowRepository } from '../repositories/workflow.repository';
import { JwtPayload, RecordType } from '../types';
import { isAdminRole } from '../utils/roles';

/**
 * Notification dispatcher. Every user action is already audit-logged with
 * (action, entityType, entityId, details); auditLogService hands each one
 * here and the rule table below decides who — if anyone — hears about it.
 *
 * Direction is the core rule:
 *  - a CLIENT action notifies SWFS staff (the role's / candidate's owners,
 *    or every staff member when nobody owns it);
 *  - an SWFS action notifies only the users of the client org that owns the
 *    role, and only for events a client cares about (submissions, interviews,
 *    offers, placements, roles opened or removed for them);
 *  - staff-to-staff events (@mentions, task assignment) go to that person.
 * Internal SWFS work (notes, tags, imports, bulk edits, CTC/pay data) never
 * produces a client notification, and nobody is notified of their own action.
 */

type Ctx = {
  actor: JwtPayload;
  isAdmin: boolean;
  actorLabel: string;
  /** The acting user's display name (staff-to-staff messages). */
  actorName: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  candidate: Awaited<ReturnType<typeof candidateRepository.findById>> | null;
  job: Awaited<ReturnType<typeof jobRepository.findById>> | null;
};

type Audience =
  | { to: 'staff'; extraUserIds?: string[]; extraEmails?: string[] }
  | { to: 'clients' }
  | { to: 'users'; userIds: string[] };

type Rule = (ctx: Ctx) => Promise<(NewNotification & Audience) | null> | (NewNotification & Audience) | null;

const human = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/_/g, ' ');
const excerpt = (s: unknown, n = 140) => {
  const t = String(s ?? '').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const when = (iso: unknown) =>
  iso
    ? new Date(String(iso)).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';
const candName = (ctx: Ctx) => (ctx.candidate ? `${ctx.candidate.firstName} ${ctx.candidate.lastName}` : 'A candidate');
const jobTitle = (ctx: Ctx) => ctx.job?.title ?? 'a role';
const candLink = (ctx: Ctx) => `/candidates/${ctx.entityId}`;
const jobLink = (ctx: Ctx) => (ctx.job ? `/jobs/${ctx.job._id}` : null);

/** Client actor → staff. */
const fromClient = (type: string, title: (c: Ctx) => string, body?: (c: Ctx) => string, link?: (c: Ctx) => string | null): Rule => (ctx) =>
  ctx.isAdmin ? null : { to: 'staff', type, title: title(ctx), body: body?.(ctx) ?? jobTitle(ctx), link: (link ?? candLink)(ctx) };

/** SWFS actor → the owning client org. */
const fromSwfs = (type: string, title: (c: Ctx) => string, body?: (c: Ctx) => string, link?: (c: Ctx) => string | null): Rule => (ctx) =>
  ctx.isAdmin ? { to: 'clients', type, title: title(ctx), body: body?.(ctx) ?? jobTitle(ctx), link: (link ?? candLink)(ctx) } : null;

const either = (...rules: Rule[]): Rule => async (ctx) => {
  for (const r of rules) {
    const out = await r(ctx);
    if (out) return out;
  }
  return null;
};

const RULES: Record<string, Rule> = {
  // ---- Pipeline decisions ---------------------------------------------------
  SHORTLIST: fromClient('CLIENT_SHORTLISTED', (c) => `${c.actorLabel} shortlisted ${candName(c)}`),
  REJECT: fromClient(
    'CLIENT_REJECTED',
    (c) => `${c.actorLabel} rejected ${candName(c)}`,
    (c) => [jobTitle(c), c.details.rejectionReason && `Reason: ${human(c.details.rejectionReason)}`, c.details.rejectionNote && `“${excerpt(c.details.rejectionNote, 100)}”`].filter(Boolean).join(' · ')
  ),
  SELECT_CANDIDATE: either(
    fromClient('CLIENT_SELECTED', (c) => `${c.actorLabel} selected ${candName(c)}`),
    fromSwfs('CANDIDATE_SELECTED', (c) => `${candName(c)} selected for ${jobTitle(c)}`)
  ),
  CHANGE_STAGE: either(
    fromClient('CLIENT_STAGE_CHANGED', (c) => `${c.actorLabel} moved ${candName(c)} to ${human(c.details.stage)}`),
    (ctx) =>
      ctx.isAdmin && ctx.details.stage === 'HIRED'
        ? { to: 'clients', type: 'CANDIDATE_HIRED', title: `${candName(ctx)} marked as hired`, body: jobTitle(ctx), link: candLink(ctx) }
        : null
  ),
  LINK_JOB: fromClient('CLIENT_LINKED', (c) => `${c.actorLabel} added ${candName(c)} to ${jobTitle(c)}`),
  SUBMIT_TO_CLIENT: fromSwfs(
    'CANDIDATE_SUBMITTED',
    (c) => `New candidate for ${jobTitle(c)}: ${candName(c)}`,
    (c) => (c.details.note ? `“${excerpt(c.details.note)}”` : 'Submitted by SWFS for your review')
  ),
  CLIENT_VIEWED_SUBMISSION: async (ctx) => {
    if (ctx.isAdmin || !ctx.candidate) return null;
    const submitters = ctx.candidate.jobLinks
      .filter((l) => l.organizationId === ctx.actor.organizationId && (l as { submittedByEmail?: string }).submittedByEmail)
      .map((l) => (l as { submittedByEmail?: string }).submittedByEmail!);
    return {
      to: 'staff',
      extraEmails: submitters,
      type: 'CLIENT_VIEWED',
      title: `${ctx.actorLabel} viewed ${candName(ctx)}`,
      body: 'Your submission was opened',
      link: candLink(ctx),
    };
  },

  // ---- Interviews -----------------------------------------------------------
  REQUEST_INTERVIEW: fromClient('CLIENT_INTERVIEW', (c) => `${c.actorLabel} requested an interview with ${candName(c)}`),
  SCHEDULE_INTERVIEW: either(
    fromClient(
      'CLIENT_INTERVIEW',
      (c) => `${c.actorLabel} scheduled round ${c.details.round ?? ''} with ${candName(c)}`.replace('  ', ' '),
      (c) => [jobTitle(c), when(c.details.scheduledAt)].filter(Boolean).join(' · ')
    ),
    fromSwfs(
      'INTERVIEW_SCHEDULED',
      (c) => `Interview scheduled: ${candName(c)}`,
      (c) => [jobTitle(c), c.details.round && `Round ${c.details.round}`, when(c.details.scheduledAt)].filter(Boolean).join(' · ')
    )
  ),
  UPDATE_INTERVIEW: async (ctx) => {
    const status = ctx.details.status as string | undefined;
    const rescheduled = !!ctx.details.scheduledAt;
    if (!status && !rescheduled) return null;
    const what = rescheduled && (!status || status === 'SCHEDULED') ? `rescheduled to ${when(ctx.details.scheduledAt)}` : human(status);
    if (!ctx.isAdmin) {
      return { to: 'staff', type: 'CLIENT_INTERVIEW', title: `${ctx.actorLabel} marked an interview ${what}`, body: `${candName(ctx)} · ${jobTitle(ctx)}`, link: candLink(ctx) };
    }
    // Clients only need to hear about changes to their calendar.
    if (status === 'CANCELLED' || rescheduled) {
      return { to: 'clients', type: 'INTERVIEW_CHANGED', title: `Interview ${what}: ${candName(ctx)}`, body: jobTitle(ctx), link: candLink(ctx) };
    }
    return null;
  },
  SUBMIT_INTERVIEW_FEEDBACK: fromClient(
    'CLIENT_FEEDBACK',
    (c) => `${c.actorLabel} left round ${c.details.round} feedback on ${candName(c)}`,
    (c) => [c.details.rating && `${c.details.rating}★`, excerpt(c.details.feedback)].filter(Boolean).join(' · ')
  ),
  SUBMIT_FEEDBACK: fromClient(
    'CLIENT_FEEDBACK',
    (c) => `${c.actorLabel} left feedback on ${candName(c)}`,
    (c) => [c.details.rating && `${c.details.rating}★`, excerpt(c.details.feedback)].filter(Boolean).join(' · ')
  ),

  SUBMIT_SCORECARD: fromClient(
    'CLIENT_FEEDBACK',
    (c) => `${c.actorLabel} scored round ${c.details.round} for ${candName(c)}`,
    (c) =>
      [
        human(c.details.recommendation).replace(/^\w/, (m) => m.toUpperCase()),
        c.details.overall != null && `${c.details.overall}/5 overall`,
        jobTitle(c),
      ]
        .filter(Boolean)
        .join(' · ')
  ),

  // ---- Offers & placements --------------------------------------------------
  EXTEND_OFFER: either(
    fromClient('CLIENT_OFFER', (c) => `${c.actorLabel} extended an offer to ${candName(c)}`),
    fromSwfs('OFFER_EXTENDED', (c) => `Offer extended to ${candName(c)}`)
  ),
  UPDATE_OFFER: async (ctx) => {
    const status = ctx.details.status as string | undefined;
    if (!status || status === 'EXTENDED') return null;
    const title = `Offer ${human(status)}: ${candName(ctx)}`;
    return ctx.isAdmin
      ? { to: 'clients', type: 'OFFER_UPDATED', title, body: jobTitle(ctx), link: candLink(ctx) }
      : { to: 'staff', type: 'CLIENT_OFFER', title: `${ctx.actorLabel}: ${title.charAt(0).toLowerCase()}${title.slice(1)}`, body: jobTitle(ctx), link: candLink(ctx) };
  },
  CREATE_PLACEMENT: async (ctx) => {
    if (!ctx.isAdmin) return null;
    const p = ctx.details.placementId ? await pipelineRepository.findPlacement(String(ctx.details.placementId)) : null;
    const start = p?.startDate ? new Date(`${p.startDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
    return { to: 'clients', type: 'PLACEMENT_CREATED', title: `${candName(ctx)} is placed`, body: [jobTitle(ctx), start && `Starts ${start}`].filter(Boolean).join(' · '), link: candLink(ctx) };
  },
  UPDATE_PLACEMENT: (ctx) =>
    ctx.isAdmin && (ctx.details.status === 'COMPLETED' || ctx.details.status === 'TERMINATED')
      ? { to: 'clients', type: 'PLACEMENT_ENDED', title: `Placement ${human(ctx.details.status)}: ${candName(ctx)}`, body: jobTitle(ctx), link: candLink(ctx) }
      : null,

  // ---- Roles ----------------------------------------------------------------
  CREATE_JOB: either(
    fromClient('CLIENT_NEW_ROLE', (c) => `${c.actorLabel} opened a new role`, (c) => String(c.details.title ?? jobTitle(c)), jobLink),
    fromSwfs('ROLE_OPENED', (c) => `New role opened for you: ${c.details.title ?? jobTitle(c)}`, () => 'Created by SWFS', jobLink)
  ),
  UPDATE_JOB: fromClient(
    'CLIENT_ROLE_UPDATED',
    (c) => `${c.actorLabel} updated ${jobTitle(c)}`,
    (c) => (c.details.status ? `Status: ${human(c.details.status)}` : 'Role details changed'),
    jobLink
  ),
  UPLOAD_JOB_DESCRIPTION: fromClient('CLIENT_ROLE_UPDATED', (c) => `${c.actorLabel} attached a job description`, jobTitle, jobLink),
  DELETE_JOB: (ctx) =>
    ctx.isAdmin && ctx.details.organizationId
      ? { to: 'clients', type: 'ROLE_REMOVED', title: `Role removed: ${ctx.details.title}`, body: 'Removed by SWFS', link: '/jobs' }
      : null,

  // ---- Staff collaboration ----------------------------------------------------
  ADD_NOTE: (ctx) => mentionRule(ctx),
  LOG_CALL: (ctx) => mentionRule(ctx),
  LOG_EMAIL: (ctx) => mentionRule(ctx),
  LOG_MEETING: (ctx) => mentionRule(ctx),
  LOG_FOLLOW_UP: (ctx) => mentionRule(ctx),
  CREATE_TASK: (ctx) => taskRule(ctx, 'assigned you a task'),
  ASSIGN_TASK: (ctx) => taskRule(ctx, 'assigned you a task'),
};

function recordPath(type: string, id: string) {
  return type === 'candidate' ? `/candidates/${id}` : type === 'job' ? `/jobs/${id}` : type === 'organization' ? `/organization/${id}` : '/my-work';
}

async function mentionRule(ctx: Ctx): Promise<(NewNotification & Audience) | null> {
  const mentions = (ctx.details.mentions as string[] | undefined) ?? [];
  if (!ctx.isAdmin || !mentions.length) return null;
  const labels = await workflowRepository.recordLabels([{ recordType: ctx.entityType as RecordType, recordId: ctx.entityId }]);
  const label = labels.get(`${ctx.entityType}:${ctx.entityId}`);
  const on = label ? ` on ${label}` : '';
  return {
    to: 'users',
    userIds: mentions,
    type: 'MENTION',
    title: `${ctx.actorName} mentioned you${on}`,
    body: excerpt(ctx.details.body),
    link: recordPath(ctx.entityType, ctx.entityId),
  };
}

function taskRule(ctx: Ctx, verb: string): (NewNotification & Audience) | null {
  const assigneeId = ctx.details.assigneeId as string | undefined;
  if (!ctx.isAdmin || !assigneeId) return null;
  return {
    to: 'users',
    userIds: [assigneeId],
    type: 'TASK_ASSIGNED',
    title: `${ctx.actorName} ${verb}`,
    body: [ctx.details.title, ctx.details.dueAt && `Due ${when(ctx.details.dueAt)}`].filter(Boolean).join(' · '),
    link: '/my-work',
  };
}

async function resolveJobId(entityType: string, entityId: string, details: Record<string, unknown>): Promise<string | null> {
  if (details.jobId) return String(details.jobId);
  if (entityType === 'job') return entityId;
  if (details.interviewId) return (await pipelineRepository.findInterview(String(details.interviewId)))?.jobId ?? null;
  if (details.offerId) return (await pipelineRepository.findOffer(String(details.offerId)))?.jobId ?? null;
  if (details.placementId) return (await pipelineRepository.findPlacement(String(details.placementId)))?.jobId ?? null;
  return null;
}

export const notificationService = {
  /** Called for every audited action. Never throws — notifications must not break the action. */
  dispatch: async (actor: JwtPayload, action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}) => {
    const rule = RULES[action];
    if (!rule) return;
    try {
      const isAdmin = isAdminRole(actor.role);
      const jobId = await resolveJobId(entityType, entityId, details);
      const job = jobId ? await jobRepository.findById(jobId) : null;
      const candidate = entityType === 'candidate' ? await candidateRepository.findById(entityId) : null;
      const ctx: Ctx = {
        actor,
        isAdmin,
        actorLabel: isAdmin ? 'SWFS' : actor.organizationName || 'Client',
        actorName: (await notificationRepository.userName(actor.userId)) ?? actor.email,
        entityType,
        entityId,
        details,
        candidate,
        job,
      };
      const out = await rule(ctx);
      if (!out) return;

      let recipients: string[] = [];
      if (out.to === 'users') {
        recipients = out.userIds;
      } else if (out.to === 'clients') {
        // Only ever the org that owns the role — never another client.
        const orgId = job?.organizationId ?? (details.organizationId as string | undefined);
        if (!orgId) return;
        recipients = await notificationRepository.clientIds(orgId);
      } else {
        const owners = [job?.owner?.id, (candidate as { owner?: { id: string } | null } | null)?.owner?.id].filter(Boolean) as string[];
        const byEmail = out.extraEmails?.length ? await notificationRepository.userIdsByEmail(out.extraEmails) : [];
        const staff = await notificationRepository.staffIds();
        const staffSet = new Set(staff);
        recipients = [...owners, ...byEmail, ...(out.extraUserIds ?? [])].filter((id) => staffSet.has(id));
        // Nobody (still on the team) owns it → the whole SWFS team should know.
        if (!recipients.length) recipients = staff;
      }
      recipients = recipients.filter((id) => id && id !== actor.userId);
      await notificationRepository.createForUsers(recipients, {
        type: out.type,
        title: out.title.slice(0, 250),
        body: out.body ? String(out.body).slice(0, 500) : null,
        link: out.link ?? null,
        actorName: isAdmin ? 'SWFS' : actor.organizationName,
      });
    } catch (err) {
      console.warn(`[notifications] ${action} dispatch failed:`, (err as Error).message);
    }
  },

  list: (userId: string, opts: { unreadOnly?: boolean; limit?: number; before?: Date }) => notificationRepository.listForUser(userId, opts),
  unreadCount: (userId: string) => notificationRepository.unreadCount(userId),
  markRead: (userId: string, ids: string[]) => notificationRepository.markRead(userId, ids),
  markAllRead: (userId: string) => notificationRepository.markAllRead(userId),
  purgeOld: () => notificationRepository.purgeReadBefore(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)),
};
