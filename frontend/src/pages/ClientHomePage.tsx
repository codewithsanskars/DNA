import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AppLayout from '../components/layout/AppLayout';
import Button from '../components/shared/Button';
import Badge, { StatusBadge } from '../components/shared/Badge';
import Icon, { IconName } from '../components/shared/Icon';
import { CenteredSpinner } from '../components/shared/LoadingSpinner';
import { ErrorState } from '../components/shared/States';
import { useToast } from '../components/shared/Toast';
import CandidateAvatar from '../components/candidates/CandidateAvatar';
import RejectDialog from '../components/candidates/RejectDialog';
import { KpiCard, ChartCard } from '../components/dashboard/Widgets';
import { FunnelChart, TrendChart, TimeInStageChart, RankBars, rejectionLabel } from '../components/dashboard/Charts';
import { CandidateListModal, CandidateListSpec, PlacementsModal } from '../components/dashboard/DetailModals';
import { useChartTheme } from '../components/dashboard/chartTheme';
import Pagination, { PAGE_SIZE, pageSlice } from '../components/shared/Pagination';
import { dashboardApi } from '../api/dashboard.api';
import { candidateApi } from '../api/candidate.api';
import { queryKeys } from '../api/queryKeys';
import { useAuth } from '../context/AuthContext';
import { CandidateStage, ClientHomeCandidate, ClientHomeRole } from '../types';
import { formatDateTime, humanize, timeAgo } from '../utils/format';
import { daysUntil, formatDay, formatMoney, INTERVIEW_MODE_LABELS } from '../utils/labels';
import { errorMessage } from '../utils/errors';

const PIPE: { stage: CandidateStage; label: string; cls: string }[] = [
  { stage: 'SUBMITTED', label: 'Submitted', cls: 'bg-brand' },
  { stage: 'SHORTLISTED', label: 'Shortlisted', cls: 'bg-violet-500' },
  { stage: 'INTERVIEW', label: 'Interview', cls: 'bg-sky-500' },
  { stage: 'OFFER', label: 'Offer', cls: 'bg-amber-500' },
  { stage: 'HIRED', label: 'Hired', cls: 'bg-emerald-500' },
];
// Same stages the Active pipeline KPI counts (everything not hired or rejected).
const ACTIVE_STAGES = 'APPLIED,SCREENING,SUBMITTED,SHORTLISTED,INTERVIEW,OFFER';

type SectionId = 'review' | 'interviews' | 'offers' | 'roles' | 'analytics';
type ReviewSort = 'newest' | 'waiting';

function Section({
  id,
  title,
  count,
  action,
  flash,
  children,
}: {
  id: SectionId;
  title: string;
  count?: number;
  action?: React.ReactNode;
  flash?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      id={`home-${id}`}
      className={`scroll-mt-4 overflow-hidden rounded-lg border bg-card shadow-xs transition-shadow duration-500 ${
        flash ? 'border-brand/50 ring-2 ring-brand/30' : 'border-border'
      }`}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          {title}
          {count !== undefined && (
            <span className="rounded-full bg-muted px-1.5 text-2xs font-medium text-muted-foreground ring-1 ring-inset ring-border">{count}</span>
          )}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function Empty({ icon, text }: { icon: IconName; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <Icon name={icon} size={18} className="text-subtle-foreground" />
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  );
}

/** Stacked bar + legend; every segment and legend entry opens the people in that stage. */
function RolePipeline({ role, onStage }: { role: ClientHomeRole; onStage: (stage: CandidateStage) => void }) {
  const total = PIPE.reduce((s, p) => s + role.stageCounts[p.stage], 0);
  return (
    <div>
      <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
        {total > 0 &&
          PIPE.map((p) =>
            role.stageCounts[p.stage] ? (
              <button
                key={p.stage}
                type="button"
                onClick={() => onStage(p.stage)}
                className={`${p.cls} transition-opacity hover:opacity-75 focus-visible:opacity-75`}
                style={{ width: `${(role.stageCounts[p.stage] / total) * 100}%` }}
                title={`${p.label}: ${role.stageCounts[p.stage]}. Click to see who`}
                aria-label={`${p.label}: ${role.stageCounts[p.stage]}`}
              />
            ) : null
          )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-1 gap-y-0.5 text-2xs text-muted-foreground">
        {PIPE.map((p) => (
          <button
            key={p.stage}
            type="button"
            disabled={!role.stageCounts[p.stage]}
            onClick={() => onStage(p.stage)}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors enabled:hover:bg-muted enabled:hover:text-foreground disabled:opacity-60"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${p.cls}`} />
            {p.label} <span className="font-semibold tabular-nums text-foreground">{role.stageCounts[p.stage]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Week-over-week arrow for the submissions trend. */
function Delta({ now, prev }: { now: number; prev: number }) {
  if (now === prev) return <span className="text-subtle-foreground">same as last week</span>;
  const up = now > prev;
  return (
    <span className={up ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
      {up ? '▲' : '▼'} {Math.abs(now - prev)} vs last week
    </span>
  );
}

/**
 * Client home (CLIENT role only). Interactive: a role filter (kept in the URL)
 * narrows every KPI, chart and list; KPI tiles jump to or open what's behind
 * them; chart marks and pipeline segments open the matching candidates. All
 * data is scoped to the client's own organization by the API.
 */
export default function ClientHomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const t = useChartTheme();
  const [params, setParams] = useSearchParams();
  const roleId = params.get('role') || undefined;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<ClientHomeCandidate | null>(null);
  const [drill, setDrill] = useState<CandidateListSpec | null>(null);
  const [showPlacements, setShowPlacements] = useState(false);
  const [flash, setFlash] = useState<SectionId | null>(null);
  const [sort, setSort] = useState<ReviewSort>('newest');
  const [newOnly, setNewOnly] = useState(false);
  const [reviewPage, setReviewPage] = useState(1);
  // A different filter or order starts the queue from its first page.
  useEffect(() => setReviewPage(1), [roleId, sort, newOnly]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.clientHome,
    queryFn: dashboardApi.getClientHome,
    refetchInterval: 60_000,
  });
  const insights = useQuery({
    queryKey: queryKeys.insightsFor(roleId),
    queryFn: () => dashboardApi.getInsights(roleId),
    placeholderData: keepPreviousData,
    refetchInterval: 120_000,
  });

  // Clear the comparison selection when the role filter changes.
  useEffect(() => setSelected(new Set()), [roleId]);

  const setRole = (id?: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set('role', id);
    else next.delete('role');
    setParams(next, { replace: true });
  };

  const jump = (id: SectionId) => {
    document.getElementById(`home-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setFlash(id);
    window.setTimeout(() => setFlash((f) => (f === id ? null : f)), 1400);
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.clientHome });
    queryClient.invalidateQueries({ queryKey: queryKeys.candidates });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    queryClient.invalidateQueries({ queryKey: queryKeys.insights });
  };

  const shortlist = useMutation({
    mutationFn: (c: ClientHomeCandidate) => candidateApi.shortlist(c.candidateId, c.jobId),
    onSuccess: (_d, c) => {
      refresh();
      toast.success(`${c.name} shortlisted`);
    },
    onError: (err) => toast.error('Couldn’t shortlist', errorMessage(err, 'Please try again.')),
  });

  const reject = useMutation({
    mutationFn: ({ c, rejection }: { c: ClientHomeCandidate; rejection: Parameters<typeof candidateApi.reject>[2] }) =>
      candidateApi.reject(c.candidateId, c.jobId, rejection),
    onSuccess: (_d, { c }) => {
      setRejecting(null);
      refresh();
      toast.success(`${c.name} rejected`);
    },
    onError: (err) => toast.error('Couldn’t reject', errorMessage(err, 'Please try again.')),
  });

  // ---- Role-filtered views --------------------------------------------------
  const view = useMemo(() => {
    if (!data) return null;
    const inRole = <T extends { jobId: string }>(xs: T[]) => (roleId ? xs.filter((x) => x.jobId === roleId) : xs);
    let review = inRole(data.awaitingReview);
    const reviewTotal = review.length;
    if (newOnly) review = review.filter((c) => !c.clientViewedAt);
    review = [...review].sort((a, b) => {
      const ta = new Date(a.submittedAt ?? 0).getTime();
      const tb = new Date(b.submittedAt ?? 0).getTime();
      return sort === 'newest' ? tb - ta : ta - tb;
    });
    const roles = data.roles.filter((r) => r.status !== 'CLOSED' && (!roleId || r.id === roleId));
    return {
      review,
      reviewTotal,
      unseen: inRole(data.awaitingReview).filter((c) => !c.clientViewedAt).length,
      interviews: inRole(data.upcomingInterviews),
      offers: inRole(data.openOffers),
      placements: inRole(data.activePlacements),
      roles,
      reviewCountByRole: data.awaitingReview.reduce<Record<string, number>>((acc, c) => ((acc[c.jobId] = (acc[c.jobId] ?? 0) + 1), acc), {}),
    };
  }, [data, roleId, sort, newOnly]);

  const firstName = user?.name?.split(' ')[0];

  if (isLoading) {
    return (
      <AppLayout title="Home">
        <CenteredSpinner />
      </AppLayout>
    );
  }
  if (error || !data || !view) {
    return (
      <AppLayout title="Home">
        <ErrorState onRetry={() => refetch()} />
      </AppLayout>
    );
  }

  const openRoles = data.roles.filter((r) => r.status === 'OPEN');
  const activeRole = roleId ? data.roles.find((r) => r.id === roleId) : undefined;
  const selectedList = view.review.filter((c) => selected.has(c.applicationId));
  // Clamp, so deciding on the last candidate of the last page doesn't leave an empty page.
  const reviewPages = Math.max(1, Math.ceil(view.review.length / PAGE_SIZE));
  const currentReviewPage = Math.min(reviewPage, reviewPages);
  const reviewRows = pageSlice(view.review, currentReviewPage);
  const compareIds = [...new Set(selectedList.map((c) => c.candidateId))];
  const sameRole = new Set(selectedList.map((c) => c.jobId)).size === 1 ? selectedList[0]?.jobId : undefined;

  const ins = insights.data;
  const k = ins?.kpis;
  const trend = ins?.trend ?? [];
  const subThis = trend[trend.length - 1]?.submitted ?? 0;
  const subPrev = trend[trend.length - 2]?.submitted ?? 0;
  const nextInterview = view.interviews[0];
  const scopeLabel = activeRole ? activeRole.title : 'all your roles';

  const openStage = (stage: CandidateStage | string, title?: string) =>
    setDrill({
      title: title ?? `${humanize(stage.split(',')[0])}${activeRole ? ` · ${activeRole.title}` : ''}`,
      stage,
      jobId: roleId,
      fullListPath: roleId ? `/jobs/${roleId}?view=board` : '/candidates',
    });

  return (
    <AppLayout title="Home">
      {/* Greeting */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{firstName ? `Welcome back, ${firstName}` : 'Welcome back'}</h2>
          <p className="text-xs text-muted-foreground">
            {view.reviewTotal
              ? `${view.reviewTotal} candidate${view.reviewTotal === 1 ? '' : 's'} waiting on your decision${view.unseen ? ` · ${view.unseen} new` : ''}.`
              : 'Nothing waiting on you right now.'}{' '}
            {ins && <span className="text-subtle-foreground">Updated {timeAgo(ins.generatedAt)}.</span>}
          </p>
        </div>
        {view.reviewTotal > 0 && (
          <Button size="sm" variant="primary" icon="inbox" onClick={() => jump('review')}>
            Review {view.reviewTotal}
          </Button>
        )}
      </div>

      {/* Role filter */}
      {openRoles.length > 1 && (
        <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Filter by role">
          {[{ id: undefined as string | undefined, title: 'All roles' }, ...openRoles].map((r) => {
            const on = roleId === r.id;
            const waiting = r.id ? view.reviewCountByRole[r.id] : data.awaitingReview.length;
            return (
              <button
                key={r.id ?? 'all'}
                type="button"
                aria-pressed={on}
                onClick={() => setRole(r.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  on ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground'
                }`}
              >
                {r.title}
                {waiting ? (
                  <span className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${on ? 'bg-background/20' : 'bg-brand text-white'}`}>{waiting}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {/* KPI tiles: each opens or jumps to what's behind it */}
      <div className={`mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6 transition-opacity ${insights.isFetching ? 'opacity-80' : ''}`}>
        <KpiCard
          label="Awaiting review"
          value={view.reviewTotal}
          icon="inbox"
          tone={view.reviewTotal ? 'brand' : undefined}
          sub={view.unseen ? `${view.unseen} not opened yet` : view.reviewTotal ? 'All opened' : 'All caught up'}
          hint="Jump to the review queue"
          onClick={() => jump('review')}
        />
        <KpiCard
          label="Active pipeline"
          value={k?.activePipeline ?? '—'}
          icon="users"
          sub={<Delta now={subThis} prev={subPrev} />}
          hint="Everyone currently in play"
          onClick={() => openStage(ACTIVE_STAGES, `Active pipeline · ${scopeLabel}`)}
        />
        <KpiCard
          label="Interviews · 14d"
          value={view.interviews.length}
          icon="calendar"
          sub={nextInterview ? `Next ${formatDateTime(nextInterview.scheduledAt)}` : 'None scheduled'}
          hint="Jump to upcoming interviews"
          onClick={() => jump('interviews')}
        />
        <KpiCard
          label="Offers out"
          value={view.offers.length}
          icon="mail"
          tone={view.offers.some((o) => o.expiresAt && daysUntil(o.expiresAt) <= 3) ? 'warn' : undefined}
          sub={k?.offerAcceptance != null ? `${k.offerAcceptance}% accepted historically` : 'No decided offers yet'}
          hint="Jump to open offers"
          onClick={() => jump('offers')}
        />
        <KpiCard
          label="Time to hire"
          value={k?.medianTimeToHireDays != null ? (k.medianTimeToHireDays < 1 ? '<1d' : `${Math.round(k.medianTimeToHireDays)}d`) : '—'}
          icon="clock"
          sub={k ? `median · ${k.hiresLast180d} hire${k.hiresLast180d === 1 ? '' : 's'} in 180d` : ''}
          hint="See everyone you've hired"
          onClick={() => openStage('HIRED', `Hired · ${scopeLabel}`)}
        />
        <KpiCard
          label="People placed"
          value={view.placements.length}
          icon="award"
          tone={view.placements.length ? 'good' : undefined}
          sub={view.placements.length ? 'Currently working with you' : 'No placements yet'}
          hint="See active placements"
          onClick={() => setShowPlacements(true)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Review queue */}
          <Section
            id="review"
            title="Awaiting your review"
            count={view.review.length}
            flash={flash === 'review'}
            action={
              selected.size > 0 ? (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    icon="columns"
                    disabled={compareIds.length < 2 || compareIds.length > 4}
                    onClick={() => navigate(`/compare?ids=${compareIds.join(',')}${sameRole ? `&jobId=${sameRole}` : ''}`)}
                  >
                    Compare {compareIds.length}
                  </Button>
                  <button type="button" onClick={() => setSelected(new Set())} className="text-xs text-muted-foreground hover:text-foreground">
                    Clear
                  </button>
                </div>
              ) : view.reviewTotal > 0 ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-pressed={newOnly}
                    onClick={() => setNewOnly((v) => !v)}
                    className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                      newOnly ? 'border-brand/50 bg-brand-subtle text-brand-text' : 'border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    New only{view.unseen ? ` · ${view.unseen}` : ''}
                  </button>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as ReviewSort)}
                    aria-label="Sort review queue"
                    className="h-7 rounded-md border border-border bg-card px-2 text-xs text-foreground"
                  >
                    <option value="newest">Newest first</option>
                    <option value="waiting">Waiting longest</option>
                  </select>
                </div>
              ) : undefined
            }
          >
            {view.review.length === 0 ? (
              <Empty
                icon="inbox"
                text={
                  newOnly && view.reviewTotal
                    ? 'You’ve opened everyone in the queue. Turn off “New only” to see them.'
                    : 'When SWFS submits candidates for your roles, they’ll appear here for review.'
                }
              />
            ) : (
              <>
                {view.review.length >= 2 && selected.size === 0 && (
                  <p className="border-b border-border bg-muted/40 px-4 py-1.5 text-2xs text-subtle-foreground">Tick 2–4 candidates to compare them side by side.</p>
                )}
                <ul className="divide-y divide-border">
                  {reviewRows.map((c) => {
                    const available = c.availableFrom
                      ? daysUntil(c.availableFrom) <= 0
                        ? 'Available now'
                        : `Available ${formatDay(c.availableFrom)}`
                      : c.noticePeriod != null
                        ? `${c.noticePeriod}d notice`
                        : null;
                    const waitingDays = c.submittedAt ? Math.max(0, -daysUntil(c.submittedAt)) : null;
                    const busy =
                      (shortlist.isPending && shortlist.variables?.applicationId === c.applicationId) ||
                      (reject.isPending && reject.variables?.c.applicationId === c.applicationId);
                    return (
                      <li key={c.applicationId} className={`flex gap-3 px-4 py-3.5 transition-colors ${selected.has(c.applicationId) ? 'bg-brand-subtle/30' : 'hover:bg-muted/40'}`}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${c.name} to compare`}
                          checked={selected.has(c.applicationId)}
                          disabled={!selected.has(c.applicationId) && selected.size >= 4}
                          onChange={(e) =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(c.applicationId);
                              else next.delete(c.applicationId);
                              return next;
                            })
                          }
                          className="mt-2.5 h-4 w-4 shrink-0 cursor-pointer accent-[#D40000]"
                        />
                        <CandidateAvatar candidateId={c.candidateId} name={c.name} photoUrl={c.photoUrl} version={c.syncedAt} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link to={`/candidates/${c.candidateId}`} className="text-[13px] font-semibold text-foreground hover:underline">
                              {c.name}
                            </Link>
                            {!c.clientViewedAt && <span className="rounded bg-brand px-1 text-[10px] font-semibold text-white">New</span>}
                            {waitingDays != null && waitingDays >= 5 && <Badge tone="warning">Waiting {waitingDays}d</Badge>}
                            {!roleId && (
                              <button type="button" onClick={() => setRole(c.jobId)} className="text-2xs text-subtle-foreground hover:text-foreground hover:underline" title="Filter to this role">
                                for <span className="font-medium text-muted-foreground">{c.jobTitle}</span>
                              </button>
                            )}
                            {c.submittedAt && <span className="text-2xs text-subtle-foreground">· submitted {timeAgo(c.submittedAt)}</span>}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {[c.currentTitle, c.currentCompany].filter(Boolean).join(' · ') || '—'}
                            {c.location && ` · ${c.location}`}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-x-3 text-2xs text-subtle-foreground">
                            {c.yearsExperience != null && <span>{c.yearsExperience} yrs exp</span>}
                            {available && <span>{available}</span>}
                          </div>
                          {c.submissionNote && <p className="mt-1.5 line-clamp-2 text-xs italic text-foreground/80">“{c.submissionNote}”</p>}
                          {c.skills.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {c.skills.slice(0, 6).map((s) => (
                                <span key={s} className="rounded bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground ring-1 ring-inset ring-border">
                                  {s}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col gap-1.5">
                          <Button size="sm" variant="primary" icon="star" disabled={busy} onClick={() => shortlist.mutate(c)}>
                            Shortlist
                          </Button>
                          <Button size="sm" variant="danger" disabled={busy} onClick={() => setRejecting(c)}>
                            Reject
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <Pagination
                  className="border-t border-border px-4 py-2"
                  page={currentReviewPage}
                  pageSize={PAGE_SIZE}
                  total={view.review.length}
                  onPage={setReviewPage}
                />
              </>
            )}
          </Section>

          {/* Hiring analytics */}
          {ins && (
            <div id="home-analytics" className={`grid gap-4 md:grid-cols-2 transition-opacity ${insights.isFetching ? 'opacity-80' : ''}`}>
              <ChartCard
                title="Hiring funnel"
                description={`How candidates move through ${scopeLabel}. Click a stage to see who’s there.`}
                action={
                  ins.funnel[0]?.reached ? (
                    <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground">
                      {Math.round(((ins.funnel[ins.funnel.length - 1]?.reached ?? 0) / ins.funnel[0].reached) * 1000) / 10}% hired
                    </span>
                  ) : undefined
                }
              >
                <FunnelChart data={ins.funnel} onSelect={(stage) => openStage(stage)} />
                {ins.rejected > 0 && (
                  <button type="button" onClick={() => openStage('REJECTED', `Rejected · ${scopeLabel}`)} className="mt-3 text-2xs text-subtle-foreground hover:text-foreground">
                    {ins.rejected} rejected (not in the funnel) →
                  </button>
                )}
              </ChartCard>
              <ChartCard title="Weekly activity" description="Candidates added, submitted to you, and hired: last 12 weeks.">
                <TrendChart data={ins.trend} />
              </ChartCard>
              <ChartCard title="Where candidates wait" description="Median days in the current stage. Click a bar to see who’s waiting.">
                <TimeInStageChart data={ins.timeInStage} onSelect={(stage) => openStage(stage, `${humanize(stage)} · longest waiting first`)} />
              </ChartCard>
              {!roleId && ins.groups.length > 1 ? (
                <ChartCard title="Compare your roles" description="Active pipeline per open role. Click one to focus the dashboard on it.">
                  <RankBars
                    color={t.series[0]}
                    rows={ins.groups.map((g) => ({
                      key: g.id,
                      label: g.label,
                      value: g.pipeline,
                      sub: `${g.submitted} sent · ${g.hires} hired`,
                    }))}
                    onSelect={(id) => {
                      setRole(id);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  />
                </ChartCard>
              ) : (
                <ChartCard title="Why candidates were turned down" description="Rejection reasons recorded on this scope. Click to see the list.">
                  <RankBars
                    color={t.series[1]}
                    rows={ins.rejectionReasons.map((r) => ({ key: r.reason ?? 'none', label: rejectionLabel(r.reason ?? ''), value: r.count }))}
                    onSelect={() => openStage('REJECTED', `Rejected · ${scopeLabel}`)}
                  />
                </ChartCard>
              )}
            </div>
          )}

          {/* Roles */}
          <Section
            id="roles"
            title={activeRole ? 'This role' : 'Your roles'}
            count={view.roles.length}
            flash={flash === 'roles'}
            action={
              activeRole ? (
                <button type="button" onClick={() => setRole(undefined)} className="text-xs font-medium text-brand-text hover:underline">
                  Show all roles
                </button>
              ) : (
                <Link to="/jobs" className="text-xs font-medium text-brand-text hover:underline">
                  All roles
                </Link>
              )
            }
          >
            {view.roles.length === 0 ? (
              <Empty icon="briefcase" text="You haven’t opened any roles yet." />
            ) : (
              <ul className="divide-y divide-border">
                {view.roles.map((r) => (
                  <li key={r.id} className="px-4 py-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link to={`/jobs/${r.id}?view=board`} className="text-[13px] font-semibold text-foreground hover:underline">
                          {r.title}
                        </Link>
                        <p className="text-2xs text-subtle-foreground">
                          {[r.department, r.location, `open ${Math.max(0, -daysUntil(r.openedAt))}d`].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {r.priority === 'HIGH' && <Badge tone="danger">High priority</Badge>}
                        <StatusBadge status={r.status} />
                        {!roleId && r.status === 'OPEN' && (
                          <Button size="sm" variant="ghost" icon="filter" onClick={() => setRole(r.id)} aria-label={`Focus on ${r.title}`}>
                            Focus
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="mt-2.5">
                      <RolePipeline
                        role={r}
                        onStage={(stage) =>
                          setDrill({ title: `${humanize(stage)} · ${r.title}`, stage, jobId: r.id, fullListPath: `/jobs/${r.id}?view=board` })
                        }
                      />
                    </div>
                    {r.owner && (
                      <p className="mt-2 text-2xs text-subtle-foreground">
                        Your SWFS recruiter:{' '}
                        <a href={`mailto:${r.owner.email}?subject=${encodeURIComponent(r.title)}`} className="font-medium text-brand-text hover:underline">
                          {r.owner.name}
                        </a>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section id="interviews" title="Upcoming interviews" count={view.interviews.length} flash={flash === 'interviews'}>
            {view.interviews.length === 0 ? (
              <Empty icon="calendar" text="No interviews in the next two weeks." />
            ) : (
              <ul className="divide-y divide-border">
                {view.interviews.map((i) => {
                  const inDays = daysUntil(i.scheduledAt);
                  return (
                    <li key={i.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <Link to={`/candidates/${i.candidateId}`} className="text-[13px] font-medium text-foreground hover:underline">
                          {i.candidateName}
                        </Link>
                        {inDays <= 0 ? <Badge tone="brand">Today</Badge> : inDays === 1 ? <Badge tone="info">Tomorrow</Badge> : null}
                      </div>
                      <p className="text-2xs text-subtle-foreground">
                        {formatDateTime(i.scheduledAt)} · Round {i.round} · {INTERVIEW_MODE_LABELS[i.mode]}
                      </p>
                      <p className="truncate text-2xs text-subtle-foreground">{i.jobTitle}</p>
                      {i.location && /^https?:\/\//.test(i.location) && (
                        <a href={i.location} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-2xs font-medium text-brand-text hover:underline">
                          Join link <Icon name="external" size={10} />
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section id="offers" title="Offers out" count={view.offers.length} flash={flash === 'offers'}>
            {view.offers.length === 0 ? (
              <Empty icon="mail" text="No offers waiting on a candidate’s answer." />
            ) : (
              <ul className="divide-y divide-border">
                {view.offers.map((o) => {
                  const left = o.expiresAt ? daysUntil(o.expiresAt) : null;
                  return (
                    <li key={o.id} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <Link to={`/candidates/${o.candidateId}`} className="truncate text-[13px] font-medium text-foreground hover:underline">
                          {o.candidateName}
                        </Link>
                        {left != null && left <= 3 && <Badge tone={left < 0 ? 'danger' : 'warning'}>{left < 0 ? 'Expired' : `${left}d left`}</Badge>}
                      </div>
                      <p className="text-2xs text-subtle-foreground">
                        {formatMoney(o.amount, o.currency)}/{o.rateType === 'ANNUAL' ? 'yr' : 'hr'} · {o.jobTitle}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {k && (k.offersOut > 0 || Object.keys(ins?.offerOutcomes ?? {}).length > 0) && (
            <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
              <p className="text-2xs font-semibold uppercase tracking-wide text-subtle-foreground">Offer outcomes</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(ins?.offerOutcomes ?? {}).map(([status, n]) => (
                  <span key={status} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground ring-1 ring-inset ring-border">
                    {humanize(status)} <span className="font-semibold tabular-nums text-foreground">{n}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {rejecting && (
        <RejectDialog
          candidateName={rejecting.name}
          jobTitle={rejecting.jobTitle}
          loading={reject.isPending}
          onCancel={() => setRejecting(null)}
          onConfirm={(rejection) => reject.mutate({ c: rejecting, rejection })}
        />
      )}
      {drill && <CandidateListModal spec={drill} onClose={() => setDrill(null)} />}
      {showPlacements && <PlacementsModal isAdmin={false} onClose={() => setShowPlacements(false)} />}
    </AppLayout>
  );
}
