import { insightsRepository } from '../repositories/insights.repository';
import { CANDIDATE_STAGES } from '../entities/enums';

const n = (v: unknown) => (v == null ? 0 : Number(v));
const round1 = (v: number | null) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10) / 10);

/** Funnel order — REJECTED is reported separately. */
const FUNNEL = ['APPLIED', 'SCREENING', 'SUBMITTED', 'SHORTLISTED', 'INTERVIEW', 'OFFER', 'HIRED'] as const;
const WORKDAYS_PER_MONTH = 21.67;
const WEEKS_PER_MONTH = 52 / 12;

/** "8 hrs/day" / "40 hrs/week" → billable hours per month (defaults to 8h/day). */
function monthlyHours(raw: string | null): number {
  const m = raw?.match(/[\d.]+/);
  const v = m ? Number(m[0]) : NaN;
  if (!Number.isFinite(v) || v <= 0) return 8 * WORKDAYS_PER_MONTH;
  if (/week/i.test(raw!)) return v * WEEKS_PER_MONTH;
  if (/month/i.test(raw!)) return v;
  return v * WORKDAYS_PER_MONTH;
}

/**
 * Dashboard insights for one caller. `org` null = SWFS admin (every client);
 * otherwise everything is limited to that client's roles. Pay rate, margin
 * and per-client comparisons are only computed for admins — a client
 * response never contains them.
 */
export const insightsService = {
  get: async (org: string | null) => {
    const isAdmin = org === null;
    const [stages, trend, tis, sources, rejections, tth, offers, placements, groups, roles, interviews] = await Promise.all([
      insightsRepository.stageCounts(org),
      insightsRepository.weeklyTrend(org, 12),
      insightsRepository.timeInStage(org),
      insightsRepository.sources(org),
      insightsRepository.rejectionReasons(org),
      insightsRepository.timeToHire(org),
      insightsRepository.offerOutcomes(org),
      insightsRepository.activePlacements(org),
      isAdmin ? insightsRepository.byClient() : insightsRepository.byRole(org!),
      insightsRepository.roleCounts(org),
      insightsRepository.upcomingInterviewCount(org),
    ]);

    const byStage = Object.fromEntries(CANDIDATE_STAGES.map((s) => [s, 0])) as Record<string, number>;
    for (const r of stages) byStage[r.stage] = n(r.count);

    // Funnel: "reached at least this stage" among non-rejected applications.
    const reached = FUNNEL.map((stage, i) => ({
      stage,
      current: byStage[stage],
      reached: FUNNEL.slice(i).reduce((sum, s) => sum + byStage[s], 0),
    }));
    const funnel = reached.map((r, i) => ({
      ...r,
      conversion: i === 0 || !reached[i - 1].reached ? null : Math.round((r.reached / reached[i - 1].reached) * 100),
    }));

    const offerBy = Object.fromEntries(offers.map((o) => [o.status, n(o.count)])) as Record<string, number>;
    const decided = (offerBy.ACCEPTED ?? 0) + (offerBy.DECLINED ?? 0);

    // Money from ACTIVE placements.
    let billPerHour = 0;
    let payPerHour = 0;
    let monthlyBilling = 0;
    let monthlyMargin = 0;
    let rated = 0;
    const billingByClient = new Map<string, { name: string; billing: number; margin: number; placements: number }>();
    for (const p of placements) {
      const bill = p.bill != null ? Number(p.bill) : null;
      const pay = p.pay != null ? Number(p.pay) : null;
      const hrs = monthlyHours(p.hours);
      const entry = billingByClient.get(p.org_id) ?? { name: p.org_name, billing: 0, margin: 0, placements: 0 };
      entry.placements++;
      if (bill != null) {
        rated++;
        billPerHour += bill;
        monthlyBilling += bill * hrs;
        entry.billing += bill * hrs;
        if (pay != null) {
          payPerHour += pay;
          monthlyMargin += (bill - pay) * hrs;
          entry.margin += (bill - pay) * hrs;
        }
      }
      billingByClient.set(p.org_id, entry);
    }

    const active = FUNNEL.filter((s) => s !== 'HIRED').reduce((sum, s) => sum + byStage[s], 0);

    return {
      generatedAt: new Date(),
      kpis: {
        openRoles: n(roles[0]?.open),
        highPriorityRoles: n(roles[0]?.high),
        onHoldRoles: n(roles[0]?.on_hold),
        activePipeline: active,
        awaitingReview: byStage.SUBMITTED,
        inInterview: byStage.INTERVIEW,
        interviewsNext7d: n(interviews[0]?.count),
        offersOut: offerBy.EXTENDED ?? 0,
        offerAcceptance: decided ? Math.round(((offerBy.ACCEPTED ?? 0) / decided) * 100) : null,
        hired: byStage.HIRED,
        rejected: byStage.REJECTED,
        activePlacements: placements.length,
        avgTimeToHireDays: round1(tth[0]?.avg_days != null ? Number(tth[0].avg_days) : null),
        medianTimeToHireDays: round1(tth[0]?.median_days != null ? Number(tth[0].median_days) : null),
        hiresLast180d: n(tth[0]?.hires),
        // Money — bill side visible to both; cost/margin admin only.
        avgBillRate: rated ? round1(billPerHour / rated) : null,
        totalBillRate: round1(billPerHour),
        monthlyBilling: Math.round(monthlyBilling),
        ...(isAdmin
          ? {
              totalPayRate: round1(payPerHour),
              grossMarginPerHour: round1(billPerHour - payPerHour),
              monthlyMargin: Math.round(monthlyMargin),
              marginPct: monthlyBilling ? Math.round((monthlyMargin / monthlyBilling) * 1000) / 10 : null,
            }
          : {}),
      },
      funnel,
      rejected: byStage.REJECTED,
      trend: trend.map((t) => ({ week: t.week, added: n(t.added), submitted: n(t.submitted), hired: n(t.hired) })),
      timeInStage: tis
        .map((t) => ({ stage: t.stage, medianDays: round1(Number(t.median_days)), count: n(t.count) }))
        .sort((a, b) => FUNNEL.indexOf(a.stage as never) - FUNNEL.indexOf(b.stage as never)),
      sources: sources.map((s) => ({ source: s.source, count: n(s.count), hired: n(s.hired) })).sort((a, b) => b.count - a.count),
      rejectionReasons: rejections
        .map((r) => ({ reason: r.reason ?? 'UNSPECIFIED', count: n(r.count) }))
        .sort((a, b) => b.count - a.count),
      offerOutcomes: offerBy,
      // Admin: per-client roll-up incl. billing / margin. Client: their open roles.
      groups: isAdmin
        ? groups.map((g) => {
            const row = g as { id: string; name: string; open_roles: string; pipeline: string; hires: string; submitted: string };
            const money = billingByClient.get(row.id);
            return {
              id: row.id,
              label: row.name,
              openRoles: n(row.open_roles),
              pipeline: n(row.pipeline),
              submitted: n(row.submitted),
              hires: n(row.hires),
              monthlyBilling: Math.round(money?.billing ?? 0),
              monthlyMargin: Math.round(money?.margin ?? 0),
            };
          })
        : groups.map((g) => {
            const row = g as { id: string; title: string; pipeline: string; hires: string; submitted: string; days_open: string };
            return {
              id: row.id,
              label: row.title,
              pipeline: n(row.pipeline),
              submitted: n(row.submitted),
              hires: n(row.hires),
              daysOpen: n(row.days_open),
            };
          }),
    };
  },
};
