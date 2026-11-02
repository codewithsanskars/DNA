import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AppLayout from '../components/layout/AppLayout';
import Button from '../components/shared/Button';
import Badge, { StatusBadge } from '../components/shared/Badge';
import Icon, { IconName } from '../components/shared/Icon';
import { CenteredSpinner } from '../components/shared/LoadingSpinner';
import { ErrorState } from '../components/shared/States';
import { useToast } from '../components/shared/Toast';
import CandidateAvatar from '../components/candidates/CandidateAvatar';
import RejectDialog from '../components/candidates/RejectDialog';
import { dashboardApi } from '../api/dashboard.api';
import { candidateApi } from '../api/candidate.api';
import { queryKeys } from '../api/queryKeys';
import { useAuth } from '../context/AuthContext';
import { CandidateStage, ClientHomeCandidate, ClientHomeRole } from '../types';
import { formatDateTime, timeAgo } from '../utils/format';
import { daysUntil, formatDay, formatMoney, INTERVIEW_MODE_LABELS } from '../utils/labels';
import { errorMessage } from '../utils/errors';

const PIPE: { stage: CandidateStage; label: string; cls: string }[] = [
  { stage: 'SUBMITTED', label: 'Submitted', cls: 'bg-brand' },
  { stage: 'SHORTLISTED', label: 'Shortlisted', cls: 'bg-violet-500' },
  { stage: 'INTERVIEW', label: 'Interview', cls: 'bg-sky-500' },
  { stage: 'OFFER', label: 'Offer', cls: 'bg-amber-500' },
  { stage: 'HIRED', label: 'Hired', cls: 'bg-emerald-500' },
];

function Section({ title, count, action, children }: { title: string; count?: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
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

function RolePipeline({ role }: { role: ClientHomeRole }) {
  const total = PIPE.reduce((s, p) => s + role.stageCounts[p.stage], 0);
  return (
    <div>
      <div className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
        {total > 0 &&
          PIPE.map((p) =>
            role.stageCounts[p.stage] ? (
              <span key={p.stage} className={p.cls} style={{ width: `${(role.stageCounts[p.stage] / total) * 100}%` }} title={`${p.label}: ${role.stageCounts[p.stage]}`} />
            ) : null
          )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-2xs text-muted-foreground">
        {PIPE.map((p) => (
          <span key={p.stage} className="inline-flex items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${p.cls}`} />
            {p.label} <span className="font-semibold tabular-nums text-foreground">{role.stageCounts[p.stage]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Client home (CLIENT role only): what needs the client's attention right
 * now — submissions to review, interviews coming up, offers out, and each
 * role's pipeline with their SWFS recruiter. Everything is scoped to the
 * client's own organization by the API.
 */
export default function ClientHomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<ClientHomeCandidate | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.clientHome,
    queryFn: dashboardApi.getClientHome,
    refetchInterval: 60_000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.clientHome });
    queryClient.invalidateQueries({ queryKey: queryKeys.candidates });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
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

  const firstName = user?.name?.split(' ')[0];

  if (isLoading) {
    return (
      <AppLayout title="Home">
        <CenteredSpinner />
      </AppLayout>
    );
  }
  if (error || !data) {
    return (
      <AppLayout title="Home">
        <ErrorState onRetry={() => refetch()} />
      </AppLayout>
    );
  }

  const openRoles = data.roles.filter((r) => r.status === 'OPEN');
  const selectedList = data.awaitingReview.filter((c) => selected.has(c.applicationId));
  const compareIds = [...new Set(selectedList.map((c) => c.candidateId))];
  const sameRole = new Set(selectedList.map((c) => c.jobId)).size === 1 ? selectedList[0]?.jobId : undefined;
  const unseen = data.awaitingReview.filter((c) => !c.clientViewedAt).length;

  const stats: { label: string; value: number; icon: IconName; tone?: string }[] = [
    { label: 'Awaiting your review', value: data.awaitingReview.length, icon: 'inbox', tone: data.awaitingReview.length ? 'text-brand-text' : undefined },
    { label: 'Interviews · 14 days', value: data.upcomingInterviews.length, icon: 'calendar' },
    { label: 'Offers out', value: data.openOffers.length, icon: 'mail' },
    { label: 'Open roles', value: openRoles.length, icon: 'briefcase' },
    { label: 'People placed', value: data.activePlacements.length, icon: 'award' },
  ];

  return (
    <AppLayout title="Home">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-foreground">{firstName ? `Welcome back, ${firstName}` : 'Welcome back'}</h2>
        <p className="text-xs text-muted-foreground">
          {data.awaitingReview.length
            ? `${data.awaitingReview.length} candidate${data.awaitingReview.length === 1 ? '' : 's'} waiting on your decision${unseen ? ` · ${unseen} new` : ''}.`
            : 'Nothing waiting on you right now.'}
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-2xs font-medium uppercase tracking-wide text-subtle-foreground">{s.label}</p>
              <Icon name={s.icon} size={14} className="text-subtle-foreground" />
            </div>
            <p className={`mt-2 text-2xl font-semibold tabular-nums ${s.tone ?? 'text-foreground'}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section
            title="Awaiting your review"
            count={data.awaitingReview.length}
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
              ) : data.awaitingReview.length >= 2 ? (
                <span className="text-2xs text-subtle-foreground">Tick 2–4 to compare</span>
              ) : undefined
            }
          >
            {data.awaitingReview.length === 0 ? (
              <Empty icon="inbox" text="When SWFS submits candidates for your roles, they’ll appear here for review." />
            ) : (
              <ul className="divide-y divide-border">
                {data.awaitingReview.map((c) => {
                  const available = c.availableFrom
                    ? daysUntil(c.availableFrom) <= 0
                      ? 'Available now'
                      : `Available ${formatDay(c.availableFrom)}`
                    : c.noticePeriod != null
                      ? `${c.noticePeriod}d notice`
                      : null;
                  const busy = (shortlist.isPending && shortlist.variables?.applicationId === c.applicationId) || (reject.isPending && reject.variables?.c.applicationId === c.applicationId);
                  return (
                    <li key={c.applicationId} className="flex gap-3 px-4 py-3.5">
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
                          <span className="text-2xs text-subtle-foreground">
                            for <span className="font-medium text-muted-foreground">{c.jobTitle}</span>
                            {c.submittedAt && ` · submitted ${timeAgo(c.submittedAt)}`}
                          </span>
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
            )}
          </Section>

          <Section title="Your roles" count={openRoles.length} action={<Link to="/jobs" className="text-xs font-medium text-brand-text hover:underline">All roles</Link>}>
            {data.roles.length === 0 ? (
              <Empty icon="briefcase" text="You haven’t opened any roles yet." />
            ) : (
              <ul className="divide-y divide-border">
                {data.roles
                  .filter((r) => r.status !== 'CLOSED')
                  .map((r) => (
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
                        </div>
                      </div>
                      <div className="mt-2.5">
                        <RolePipeline role={r} />
                      </div>
                      {r.owner && (
                        <p className="mt-2 text-2xs text-subtle-foreground">
                          Your SWFS recruiter:{' '}
                          <a href={`mailto:${r.owner.email}`} className="font-medium text-brand-text hover:underline">
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
          <Section title="Upcoming interviews" count={data.upcomingInterviews.length}>
            {data.upcomingInterviews.length === 0 ? (
              <Empty icon="calendar" text="No interviews in the next two weeks." />
            ) : (
              <ul className="divide-y divide-border">
                {data.upcomingInterviews.map((i) => (
                  <li key={i.id} className="px-4 py-3">
                    <Link to={`/candidates/${i.candidateId}`} className="text-[13px] font-medium text-foreground hover:underline">
                      {i.candidateName}
                    </Link>
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
                ))}
              </ul>
            )}
          </Section>

          <Section title="Offers out" count={data.openOffers.length}>
            {data.openOffers.length === 0 ? (
              <Empty icon="mail" text="No offers waiting on a candidate’s answer." />
            ) : (
              <ul className="divide-y divide-border">
                {data.openOffers.map((o) => {
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

          <Section title="People placed" count={data.activePlacements.length}>
            {data.activePlacements.length === 0 ? (
              <Empty icon="award" text="No one is placed with you yet." />
            ) : (
              <ul className="divide-y divide-border">
                {data.activePlacements.slice(0, 8).map((p) => (
                  <li key={p.id} className="px-4 py-3">
                    <Link to={`/candidates/${p.candidateId}`} className="text-[13px] font-medium text-foreground hover:underline">
                      {p.candidateName}
                    </Link>
                    <p className="text-2xs text-subtle-foreground">
                      {p.jobTitle} · since {formatDay(p.startDate)}
                      {p.endDate && ` · until ${formatDay(p.endDate)}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
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
    </AppLayout>
  );
}
