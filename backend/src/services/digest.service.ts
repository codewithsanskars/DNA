import { digestRepository } from '../repositories/digest.repository';
import { candidateRepository } from '../repositories/candidate.repository';
import { jobRepository } from '../repositories/job.repository';
import { notificationRepository } from '../repositories/notification.repository';
import { AppDataSource } from '../config/data-source';
import { env } from '../config/env';
import { llm } from './llm.service';
import { matchService } from './match.service';

/**
 * Daily recruiter digest.
 *
 * Sections are deterministic SQL (always right, always explainable). The AI
 * only *ranks* items we already found into "Today's focus", choosing by id
 * from a list we give it, so it can't invent records or links. If the LLM is
 * down, a rule-based ranking takes over.
 */

export type DigestScope = 'mine' | 'team';

export interface DigestItem {
  id: string;
  title: string;
  detail: string;
  link: string;
  /** ISO time for the item's key moment (due, scheduled, submitted…). */
  at?: string;
}

export interface DigestSection {
  key: SectionKey;
  title: string;
  tone: 'danger' | 'warning' | 'info' | 'success' | 'neutral';
  items: DigestItem[];
}

export interface FocusItem {
  ref: string; // `${sectionKey}:${itemId}`
  title: string;
  why: string;
  link: string;
}

export interface Digest {
  date: string;
  scope: DigestScope;
  generatedAt: string;
  greeting: string;
  headline: string;
  focus: FocusItem[];
  focusSource: 'ai' | 'rules';
  sections: DigestSection[];
  counts: Record<SectionKey, number>;
}

type SectionKey =
  | 'feedbackMissing'
  | 'tasks'
  | 'interviewsToday'
  | 'awaitingClient'
  | 'rolesAtRisk'
  | 'stale'
  | 'followUps'
  | 'newRoles'
  | 'wins';

// Ordered by urgency; also the rule-based focus order.
const SECTION_META: Record<SectionKey, { title: string; tone: DigestSection['tone'] }> = {
  feedbackMissing: { title: 'Scorecards missing', tone: 'danger' },
  tasks: { title: 'Tasks due', tone: 'danger' },
  interviewsToday: { title: 'Interviews today', tone: 'info' },
  awaitingClient: { title: 'Waiting on client', tone: 'warning' },
  rolesAtRisk: { title: 'Roles at risk', tone: 'warning' },
  stale: { title: 'Stuck in stage', tone: 'warning' },
  followUps: { title: 'Follow up', tone: 'neutral' },
  newRoles: { title: 'New roles', tone: 'info' },
  wins: { title: 'Wins', tone: 'success' },
};
const ORDER = Object.keys(SECTION_META) as SectionKey[];

const name = (r: any) => `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim();
const human = (s?: string) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '');
const days = (d?: string | Date | null) => (d ? Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000)) : null);
const time = (d: string | Date) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const iso = (d?: string | Date | null) => (d ? new Date(d).toISOString() : undefined);
const role = (r: any) => [r.jobTitle, r.organizationName].filter(Boolean).join(' · ');

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** "Since yesterday", but on Monday look back over the weekend. */
function lookbackStart(now = new Date()) {
  const back = now.getDay() === 1 ? 3 : 1;
  return new Date(startOfDay(now).getTime() - back * 86400000);
}

function taskLink(t: any) {
  if (t.recordType === 'candidate' && t.recordId) return `/candidates/${t.recordId}`;
  if (t.recordType === 'organization' && t.recordId) return `/organization/${t.recordId}`;
  return '/my-work';
}

async function buildSections(userId: string, scope: DigestScope): Promise<DigestSection[]> {
  const owner = scope === 'mine' ? userId : null;
  const dayStart = startOfDay();
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const since = lookbackStart();

  const [interviews, feedback, tasks, awaiting, risk, stale, follow, wins, newRoles] = await Promise.all([
    digestRepository.interviewsToday(owner, dayStart, dayEnd),
    digestRepository.feedbackMissing(owner),
    digestRepository.tasksDue(scope === 'mine' ? userId : null, dayEnd),
    digestRepository.awaitingClient(owner),
    digestRepository.rolesAtRisk(owner),
    digestRepository.stalePipeline(owner),
    digestRepository.followUps(owner),
    digestRepository.wins(owner, since),
    digestRepository.newRoles(since),
  ]);

  // Roles at risk: add how many pool candidates match the JD, so the action is obvious.
  const pool = risk.length || newRoles.length ? await candidateRepository.findMatchPool({ masterPool: true }).catch(() => []) : [];
  const matchCount = async (jobId: string) => {
    const job = await jobRepository.findById(jobId);
    if (!job || !job.aiRequirements) return null; // never trigger an LLM analysis from the digest
    return (await matchService.poolInsights(job, pool).catch(() => null))?.matchCount ?? null;
  };
  const riskMatches = await Promise.all(risk.map((r) => matchCount(r.jobId)));
  const newMatches = await Promise.all(newRoles.map((r) => matchCount(r.jobId)));
  const matchUrl = (jobId: string) => `/search?tab=database&matchJobId=${jobId}&minMatch=60`;

  const sections: Record<SectionKey, DigestItem[]> = {
    feedbackMissing: feedback.map((r) => ({
      id: `${r.interviewId}`,
      title: `${name(r)}: round ${r.round} scorecard`,
      detail: `${role(r)} · ${r.interviewStatus === 'SCHEDULED' ? 'outcome not recorded' : 'interviewed'} ${days(r.scheduledAt)}d ago`,
      link: `/candidates/${r.candidateId}`,
      at: iso(r.scheduledAt),
    })),
    tasks: tasks.map((t) => {
      const overdue = new Date(t.dueAt) < startOfDay();
      return {
        id: t.id,
        title: t.title,
        detail: [overdue ? `Overdue ${days(t.dueAt)}d` : `Due ${time(t.dueAt)}`, t.priority === 'HIGH' && 'High priority', scope === 'team' && t.assigneeName]
          .filter(Boolean)
          .join(' · '),
        link: taskLink(t),
        at: iso(t.dueAt),
      };
    }),
    interviewsToday: interviews.map((r) => ({
      id: r.interviewId,
      title: `${time(r.scheduledAt)} · ${name(r)}`,
      detail: `${role(r)} · round ${r.round}${r.mode ? ` · ${human(r.mode)}` : ''}`,
      link: `/candidates/${r.candidateId}`,
      at: iso(r.scheduledAt),
    })),
    awaitingClient: awaiting.map((r) => ({
      id: r.applicationId,
      title: name(r),
      detail: `${role(r)} · submitted ${days(r.submittedAt)}d ago · ${r.clientViewedAt ? `viewed ${days(r.clientViewedAt)}d ago, no decision` : 'not opened by client'}`,
      link: `/candidates/${r.candidateId}`,
      at: iso(r.submittedAt),
    })),
    rolesAtRisk: risk.map((r, i) => ({
      id: r.jobId,
      title: r.jobTitle,
      detail: [
        r.organizationName,
        `open ${r.daysOpen}d`,
        r.lastSubmittedAt ? `last submission ${days(r.lastSubmittedAt)}d ago` : 'no submissions yet',
        r.priority === 'HIGH' && 'high priority',
        riskMatches[i] != null && `${riskMatches[i]} pool matches`,
      ]
        .filter(Boolean)
        .join(' · '),
      link: riskMatches[i] ? matchUrl(r.jobId) : `/jobs/${r.jobId}`,
    })),
    stale: stale.map((r) => ({
      id: r.applicationId,
      title: name(r),
      detail: `${human(r.stage)} for ${r.daysInStage}d · ${role(r)}`,
      link: `/candidates/${r.candidateId}`,
      at: iso(r.stageUpdatedAt),
    })),
    followUps: follow.map((r) => ({
      id: r.candidateId,
      title: name(r),
      detail: `${human(r.stage)} · ${r.jobTitle} · ${r.lastContactedAt ? `last contact ${days(r.lastContactedAt)}d ago` : 'never contacted'}`,
      link: `/candidates/${r.candidateId}`,
    })),
    newRoles: newRoles.map((r, i) => ({
      id: r.jobId,
      title: r.jobTitle,
      detail: [r.organizationName, r.priority === 'HIGH' && 'high priority', r.ownerName ? `owner ${r.ownerName}` : 'unassigned', newMatches[i] != null && `${newMatches[i]} pool matches`]
        .filter(Boolean)
        .join(' · '),
      link: newMatches[i] ? matchUrl(r.jobId) : `/jobs/${r.jobId}`,
    })),
    wins: wins.map((r) => ({
      id: r.applicationId,
      title: `${name(r)}: ${r.stage === 'HIRED' ? 'hired' : 'offer'}`,
      detail: role(r),
      link: `/candidates/${r.candidateId}`,
      at: iso(r.stageUpdatedAt),
    })),
  };

  return ORDER.map((key) => ({ key, ...SECTION_META[key], items: sections[key] }));
}

// ---------------------------------------------------------------------------
// Focus: AI ranks existing items; rules are the fallback
// ---------------------------------------------------------------------------

const ACTIONABLE: SectionKey[] = ['feedbackMissing', 'tasks', 'interviewsToday', 'awaitingClient', 'rolesAtRisk', 'stale', 'followUps', 'newRoles'];

function candidatesForFocus(sections: DigestSection[]) {
  return sections
    .filter((s) => ACTIONABLE.includes(s.key))
    .flatMap((s) => s.items.slice(0, 5).map((it) => ({ ref: `${s.key}:${it.id}`, section: s.title, title: it.title, detail: it.detail, link: it.link })));
}

function ruleFocus(sections: DigestSection[]): FocusItem[] {
  const why: Partial<Record<SectionKey, string>> = {
    feedbackMissing: 'Missing scorecards block the client’s decision.',
    tasks: 'It’s due.',
    interviewsToday: 'Prep the candidate and confirm logistics.',
    awaitingClient: 'Nudge the client before the candidate goes cold.',
    rolesAtRisk: 'No fresh submissions this week.',
    stale: 'Move them forward or close the loop.',
    followUps: 'Keep the candidate warm.',
    newRoles: 'Early submissions win.',
  };
  return candidatesForFocus(sections)
    .slice(0, 3)
    .map((c) => ({ ref: c.ref, title: c.title, why: why[c.ref.split(':')[0] as SectionKey] || '', link: c.link }));
}

async function aiFocus(sections: DigestSection[], scope: DigestScope): Promise<{ headline: string; focus: FocusItem[] } | null> {
  const pool = candidatesForFocus(sections);
  if (!pool.length) return null;
  const byRef = new Map(pool.map((p) => [p.ref, p]));
  const out = await llm.json<any>(
    [
      {
        role: 'system',
        content: `You are a recruiting team lead planning a recruiter's day. From the ITEMS list, pick the 3 actions with the most impact on placements today.
Prefer: unblocking client decisions, time-sensitive items, high-priority roles, candidates at risk of going cold.
Return JSON: {"headline":"one sentence summarising the day, max 22 words","focus":[{"ref":"<ref from ITEMS>","why":"max 14 words, concrete"}]}
Use only refs that appear in ITEMS. No markdown.`,
      },
      {
        role: 'user',
        content: `Scope: ${scope === 'mine' ? 'my own roles and candidates' : 'whole team'}\nCOUNTS: ${sections
          .map((s) => `${s.title}=${s.items.length}`)
          .join(', ')}\nITEMS:\n${pool.map((p) => `${p.ref} | ${p.section} | ${p.title} | ${p.detail}`).join('\n')}`,
      },
    ],
    { maxTokens: 500, temperature: 0.2 }
  );
  const focus: FocusItem[] = (Array.isArray(out?.focus) ? out.focus : [])
    .filter((f: any) => byRef.has(String(f?.ref)))
    .slice(0, 3)
    .map((f: any) => {
      const p = byRef.get(String(f.ref))!;
      return { ref: p.ref, title: p.title, why: String(f.why || '').slice(0, 140), link: p.link };
    });
  if (!focus.length) return null;
  return { headline: String(out?.headline || '').slice(0, 200), focus };
}

function ruleHeadline(counts: Record<SectionKey, number>): string {
  const parts = [
    counts.interviewsToday && `${counts.interviewsToday} interview${counts.interviewsToday === 1 ? '' : 's'} today`,
    counts.feedbackMissing && `${counts.feedbackMissing} scorecard${counts.feedbackMissing === 1 ? '' : 's'} missing`,
    counts.tasks && `${counts.tasks} task${counts.tasks === 1 ? '' : 's'} due`,
    counts.awaitingClient && `${counts.awaitingClient} waiting on clients`,
    counts.rolesAtRisk && `${counts.rolesAtRisk} role${counts.rolesAtRisk === 1 ? '' : 's'} at risk`,
  ].filter(Boolean);
  return parts.length ? `${parts.join(', ')}.` : 'Nothing urgent. A good day to source for open roles.';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const cache = new Map<string, { at: number; digest: Digest }>();
const CACHE_MS = 30 * 60 * 1000;

function greeting(firstName?: string | null) {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return firstName ? `${part}, ${firstName}` : part;
}

async function firstNameOf(userId: string) {
  const name = await notificationRepository.userName(userId);
  return name ? name.split(' ')[0] : null;
}

export const digestService = {
  build: async (userId: string, scope: DigestScope = 'mine', opts: { refresh?: boolean; ai?: boolean } = {}): Promise<Digest> => {
    const date = startOfDay().toISOString().slice(0, 10);
    const key = `${userId}:${scope}:${date}`;
    const hit = cache.get(key);
    if (hit && !opts.refresh && Date.now() - hit.at < CACHE_MS) return hit.digest;

    const sections = await buildSections(userId, scope);
    const counts = Object.fromEntries(sections.map((s) => [s.key, s.items.length])) as Record<SectionKey, number>;

    let headline = ruleHeadline(counts);
    let focus = ruleFocus(sections);
    let focusSource: Digest['focusSource'] = 'rules';
    if (opts.ai !== false) {
      const ai = await aiFocus(sections, scope).catch(() => null);
      if (ai) {
        focus = ai.focus;
        headline = ai.headline || headline;
        focusSource = 'ai';
      }
    }

    const digest: Digest = {
      date,
      scope,
      generatedAt: new Date().toISOString(),
      greeting: greeting(await firstNameOf(userId)),
      headline,
      focus,
      focusSource,
      sections,
      counts,
    };
    cache.set(key, { at: Date.now(), digest });
    return digest;
  },

  /** Sends today's digest notification to every active staff member who hasn't had one. Idempotent. */
  sendDailyNotifications: async () => {
    const today = startOfDay();
    const staff = await notificationRepository.staffIds();
    let sent = 0;
    for (const userId of staff) {
      if (await notificationRepository.sentSince(userId, 'DAILY_DIGEST', today)) continue;
      const d = await digestService.build(userId, 'mine').catch(() => null);
      if (!d) continue;
      const actionable = ACTIONABLE.reduce((n, k) => n + d.counts[k], 0);
      if (!actionable && !d.counts.wins) continue; // nothing to say: don't add noise
      const summary = [
        d.counts.interviewsToday && `${d.counts.interviewsToday} interviews today`,
        d.counts.feedbackMissing && `${d.counts.feedbackMissing} scorecards missing`,
        d.counts.tasks && `${d.counts.tasks} tasks due`,
        d.counts.rolesAtRisk && `${d.counts.rolesAtRisk} roles at risk`,
        d.counts.wins && `${d.counts.wins} wins`,
      ]
        .filter(Boolean)
        .join(' · ');
      await notificationRepository.createForUsers([userId], {
        type: 'DAILY_DIGEST',
        title: d.focus.length ? `Your day: ${d.focus.length} priorities` : 'Your daily digest',
        body: summary || d.headline,
        link: '/my-work#digest',
        actorName: 'SWFS',
      });
      sent++;
    }
    return { sent };
  },
};

/** In-process scheduler: checks every 10 minutes and sends once per day after DIGEST_HOUR (server local time). */
export function startDigestScheduler() {
  if (!env.digest.enabled) return;
  const tick = async () => {
    if (!AppDataSource.isInitialized) return;
    const now = new Date();
    const weekend = now.getDay() === 0 || now.getDay() === 6;
    if (now.getHours() < env.digest.hour || (weekend && !env.digest.weekends)) return;
    try {
      const { sent } = await digestService.sendDailyNotifications();
      if (sent) console.log(`[Digest] Sent ${sent} daily digest notification(s)`);
    } catch (err) {
      console.warn('[Digest] Failed to send:', (err as Error).message);
    }
  };
  setTimeout(tick, 15_000);
  setInterval(tick, 10 * 60 * 1000).unref();
}
