import { ReactNode, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import AppLayout from '../components/layout/AppLayout';
import Button from '../components/shared/Button';
import Badge, { StageBadge } from '../components/shared/Badge';
import Icon from '../components/shared/Icon';
import { CenteredSpinner } from '../components/shared/LoadingSpinner';
import { EmptyState } from '../components/shared/States';
import { useToast } from '../components/shared/Toast';
import CandidateAvatar from '../components/candidates/CandidateAvatar';
import RejectDialog from '../components/candidates/RejectDialog';
import { candidateApi } from '../api/candidate.api';
import { pipelineApi } from '../api/pipeline.api';
import { RECOMMENDATION_META } from '../components/candidates/RoundScorecards';
import { queryKeys } from '../api/queryKeys';
import { useAuth } from '../context/AuthContext';
import { isAdminRole } from '../utils/roles';
import { Candidate, RejectionReason } from '../types';
import { daysUntil, formatDay, formatMoney, SOURCE_LABELS, WORK_AUTH_LABELS } from '../utils/labels';
import { timeAgo } from '../utils/format';
import { errorMessage } from '../utils/errors';

const MAX = 4;

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Days until a candidate can start: available-from date, else notice period. */
function startsInDays(c: Candidate): number | null {
  if (c.availableFrom) return Math.max(0, daysUntil(c.availableFrom));
  return c.noticePeriod ?? null;
}

/** Index(es) of the best value in a row, for a subtle highlight. Ties all win; nulls never do. */
function bestOf(values: (number | null | undefined)[], prefer: 'high' | 'low'): Set<number> {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length < 2) return new Set();
  const target = prefer === 'high' ? Math.max(...nums) : Math.min(...nums);
  if (nums.every((n) => n === target)) return new Set();
  return new Set(values.map((v, i) => (v === target ? i : -1)).filter((i) => i >= 0));
}

function Row({ label, cells, best, hint }: { label: string; cells: ReactNode[]; best?: Set<number>; hint?: string }) {
  return (
    <tr className="border-b border-border last:border-0">
      <th scope="row" className="sticky left-0 z-10 w-44 bg-card px-4 py-3 text-left align-top text-2xs font-semibold uppercase tracking-wide text-subtle-foreground">
        {label}
        {hint && <span className="mt-0.5 block font-normal normal-case tracking-normal">{hint}</span>}
      </th>
      {cells.map((cell, i) => (
        <td
          key={i}
          className={`min-w-[200px] px-4 py-3 align-top text-[13px] text-foreground ${best?.has(i) ? 'bg-emerald-50/70 dark:bg-emerald-500/10' : ''}`}
        >
          {cell ?? <span className="text-subtle-foreground">—</span>}
        </td>
      ))}
    </tr>
  );
}

/**
 * Side-by-side comparison of 2–4 candidates. With `jobId`, rows are framed
 * around that role (stage, interview progress, submission note) and the
 * client can shortlist / reject straight from here. Every candidate is
 * loaded through the normal scoped endpoint, so a client only ever sees
 * candidates on their own roles, and never SWFS-internal fields
 * (CTC, owner, source rows render for admins only).
 */
export default function ComparePage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);
  const [rejecting, setRejecting] = useState<Candidate | null>(null);

  const ids = [...new Set((params.get('ids') ?? '').split(',').filter(Boolean))].slice(0, MAX);
  const jobId = params.get('jobId') ?? undefined;

  const results = useQueries({
    queries: ids.map((id) => ({ queryKey: queryKeys.candidate(id), queryFn: () => candidateApi.getCandidate(id) })),
  });
  // Interviews, offers and scorecards per candidate (scoped by the API).
  const recordResults = useQueries({
    queries: ids.map((id) => ({ queryKey: queryKeys.candidateRecords(id), queryFn: () => pipelineApi.getCandidateRecords(id) })),
  });
  const { data: template } = useQuery({ queryKey: queryKeys.scorecardTemplate, queryFn: pipelineApi.getScorecardTemplate, staleTime: Infinity });
  const loading = results.some((r) => r.isLoading);
  const candidates = results.map((r) => r.data).filter((c): c is Candidate => !!c);
  const missing = results.filter((r) => r.isError).length;

  const refresh = (id: string) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.candidate(id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.candidates });
    queryClient.invalidateQueries({ queryKey: queryKeys.clientHome });
  };
  const shortlist = useMutation({
    mutationFn: (c: Candidate) => candidateApi.shortlist(c._id, jobId!),
    onSuccess: (_d, c) => {
      refresh(c._id);
      toast.success(`${c.firstName} shortlisted`);
    },
    onError: (err) => toast.error('Couldn’t shortlist', errorMessage(err, 'Please try again.')),
  });
  const reject = useMutation({
    mutationFn: ({ c, rejection }: { c: Candidate; rejection: { rejectionReason: RejectionReason; rejectionNote?: string } }) =>
      candidateApi.reject(c._id, jobId!, rejection),
    onSuccess: (_d, { c }) => {
      setRejecting(null);
      refresh(c._id);
      toast.success(`${c.firstName} rejected`);
    },
    onError: (err) => toast.error('Couldn’t reject', errorMessage(err, 'Please try again.')),
  });

  const remove = (id: string) => {
    const next = ids.filter((x) => x !== id);
    const p = new URLSearchParams(params);
    p.set('ids', next.join(','));
    setParams(p, { replace: true });
  };

  const link = (c: Candidate) => (jobId ? c.jobLinks.find((l) => l.jobId === jobId) : undefined);
  const jobTitle = candidates.map(link).find(Boolean)?.jobTitle;

  if (ids.length < 2) {
    return (
      <AppLayout title="Compare candidates" backTo={isAdmin ? '/candidates' : '/dashboard'} backLabel="Back">
        <EmptyState icon="columns" title="Pick at least two candidates" description="Tick 2–4 candidates on the Candidates list or your home page, then choose Compare." />
      </AppLayout>
    );
  }

  // ---- derived rows ----------------------------------------------------------
  const skillSets = candidates.map((c) => new Set(c.skills.map((s) => s.toLowerCase())));
  const shared = candidates.length
    ? [...skillSets[0]].filter((s) => skillSets.every((set) => set.has(s)))
    : [];
  const sharedSet = new Set(shared);

  const exp = candidates.map((c) => c.yearsExperience ?? null);
  const starts = candidates.map(startsInDays);
  const interviewAvg = candidates.map((c) => {
    const l = link(c);
    return avg((l?.interviewFeedback ?? []).map((f) => f.rating).filter((r): r is number => !!r));
  });
  const feedbackAvg = candidates.map((c) => avg((c.feedback ?? []).map((f) => f.rating).filter((r): r is number => !!r)));
  const ctc = candidates.map((c) => c.expectedCtc ?? null);

  // Scorecards for the compared role (all rounds), aligned to `candidates`.
  const cardsFor = (c: Candidate) =>
    (recordResults[ids.indexOf(c._id)]?.data?.scorecards ?? []).filter((s) => !jobId || s.jobId === jobId);
  const meanOf = (xs: (number | null | undefined)[]) => {
    const n = xs.filter((x): x is number => x != null);
    return n.length ? Math.round((n.reduce((a, b) => a + b, 0) / n.length) * 10) / 10 : null;
  };
  const scoreOverall = candidates.map((c) => meanOf(cardsFor(c).map((s) => s.overall)));
  const criterionAvg = (template?.criteria ?? []).map((cr) => ({
    ...cr,
    values: candidates.map((c) => meanOf(cardsFor(c).map((s) => s.ratings.find((r) => r.key === cr.key)?.score))),
  }));
  const hasScorecards = candidates.some((c) => cardsFor(c).length > 0);

  return (
    <AppLayout
      title="Compare candidates"
      subtitle={jobTitle ? `For ${jobTitle}` : `${candidates.length} candidates`}
      backTo={isAdmin ? '/candidates' : '/dashboard'}
      backLabel="Back"
    >
      {missing > 0 && (
        <p className="mb-3 text-xs text-muted-foreground">
          {missing} candidate{missing === 1 ? '' : 's'} couldn’t be loaded (removed, or not on your roles).
        </p>
      )}
      {loading ? (
        <CenteredSpinner />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-xs">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="sticky left-0 z-10 w-44 bg-card px-4 py-4 text-left align-bottom">
                  <span className="inline-flex items-center gap-1.5 text-2xs text-subtle-foreground">
                    <span className="h-2.5 w-2.5 rounded-sm bg-emerald-100 ring-1 ring-emerald-300 dark:bg-emerald-500/20 dark:ring-emerald-500/40" /> best in row
                  </span>
                </th>
                {candidates.map((c) => {
                  const l = link(c);
                  const canDecide = !!jobId && !!l && !['REJECTED', 'OFFER', 'HIRED', 'SHORTLISTED', 'INTERVIEW'].includes(l.stage);
                  const busy = (shortlist.isPending && shortlist.variables?._id === c._id) || (reject.isPending && reject.variables?.c._id === c._id);
                  return (
                    <th key={c._id} className="min-w-[200px] px-4 py-4 text-left align-top">
                      <div className="flex items-start justify-between gap-2">
                        <CandidateAvatar candidateId={c._id} name={c.firstName} photoUrl={c.photoUrl} version={c.syncedAt} size="lg" />
                        {ids.length > 2 && (
                          <button type="button" aria-label={`Remove ${c.firstName} from comparison`} onClick={() => remove(c._id)} className="rounded p-1 text-subtle-foreground hover:bg-muted hover:text-foreground">
                            <Icon name="close" size={14} />
                          </button>
                        )}
                      </div>
                      <Link to={`/candidates/${c._id}`} className="mt-2 block text-sm font-semibold text-foreground hover:underline">
                        {c.firstName} {c.lastName}
                      </Link>
                      <p className="text-xs font-normal text-muted-foreground">{[c.currentTitle, c.currentCompany].filter(Boolean).join(' · ') || '—'}</p>
                      {l && (
                        <div className="mt-2">
                          <StageBadge stage={l.stage} />
                        </div>
                      )}
                      {canDecide && (
                        <div className="mt-3 flex gap-1.5">
                          <Button size="sm" variant="primary" icon="star" disabled={busy} onClick={() => shortlist.mutate(c)}>
                            Shortlist
                          </Button>
                          <Button size="sm" variant="danger" disabled={busy} onClick={() => setRejecting(c)}>
                            Reject
                          </Button>
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <Row label="Location" cells={candidates.map((c) => c.location)} />
              <Row label="Experience" best={bestOf(exp, 'high')} cells={exp.map((e) => (e != null ? `${e} years` : null))} />
              <Row
                label="Can start"
                best={bestOf(starts, 'low')}
                cells={candidates.map((c, i) =>
                  c.availableFrom
                    ? daysUntil(c.availableFrom) <= 0
                      ? 'Available now'
                      : `From ${formatDay(c.availableFrom)}`
                    : starts[i] != null
                      ? `${starts[i]} days’ notice`
                      : null
                )}
              />
              <Row label="Work authorization" cells={candidates.map((c) => (c.workAuthorization ? WORK_AUTH_LABELS[c.workAuthorization] : null))} />
              <Row
                label="Skills"
                hint={shared.length ? `${shared.length} shared` : undefined}
                cells={candidates.map((c) =>
                  c.skills.length ? (
                    <div className="flex flex-wrap gap-1">
                      {[...c.skills]
                        .sort((a, b) => Number(sharedSet.has(b.toLowerCase())) - Number(sharedSet.has(a.toLowerCase())))
                        .map((s) => {
                          const isShared = sharedSet.has(s.toLowerCase());
                          return (
                            <span
                              key={s}
                              title={isShared ? 'Everyone here has this' : 'Only this candidate'}
                              className={`rounded px-1.5 py-0.5 text-2xs ring-1 ring-inset ${
                                isShared ? 'bg-muted text-muted-foreground ring-border' : 'bg-brand-subtle font-medium text-brand-text ring-brand/20'
                              }`}
                            >
                              {s}
                            </span>
                          );
                        })}
                    </div>
                  ) : null
                )}
              />
              <Row label="Languages" cells={candidates.map((c) => (c.languages?.length ? c.languages.join(', ') : null))} />
              <Row
                label="Recent experience"
                cells={candidates.map((c) =>
                  c.employmentHistory?.length ? (
                    <ul className="space-y-1">
                      {c.employmentHistory.slice(0, 3).map((e, i) => (
                        <li key={i}>
                          <span className="font-medium">{e.title || 'Role'}</span>
                          <span className="text-muted-foreground"> · {e.company}</span>
                          {e.current && <Badge tone="success" className="ml-1">Current</Badge>}
                        </li>
                      ))}
                    </ul>
                  ) : null
                )}
              />
              <Row
                label="Education"
                cells={candidates.map((c) =>
                  c.education?.length ? (
                    <ul className="space-y-1">
                      {c.education.slice(0, 2).map((e, i) => (
                        <li key={i}>
                          {[e.degree, e.field].filter(Boolean).join(', ') || e.institution}
                          {(e.degree || e.field) && <span className="text-muted-foreground"> · {e.institution}</span>}
                        </li>
                      ))}
                    </ul>
                  ) : null
                )}
              />
              <Row
                label="Certifications"
                cells={candidates.map((c) =>
                  c.certifications?.length ? (
                    <ul className="space-y-0.5">
                      {c.certifications.slice(0, 4).map((x, i) => (
                        <li key={i}>
                          {x.name}
                          {x.expiresAt && daysUntil(x.expiresAt) < 0 && <Badge tone="danger" className="ml-1">Expired</Badge>}
                        </li>
                      ))}
                    </ul>
                  ) : null
                )}
              />
              {jobId && (
                <Row
                  label="Interviews"
                  hint="for this role"
                  best={bestOf(interviewAvg, 'high')}
                  cells={candidates.map((c, i) => {
                    const l = link(c);
                    if (!l || !l.interviewRound) return 'Not started';
                    return (
                      <span>
                        Round {l.interviewRound} of 3
                        {interviewAvg[i] != null && <span className="text-muted-foreground"> · avg {interviewAvg[i]!.toFixed(1)}★</span>}
                      </span>
                    );
                  })}
                />
              )}
              {hasScorecards && (
                <>
                  <Row
                    label="Scorecards"
                    hint={jobId ? 'all rounds, this role' : 'all rounds'}
                    best={bestOf(scoreOverall, 'high')}
                    cells={candidates.map((c, i) => {
                      const cards = cardsFor(c);
                      if (!cards.length) return null;
                      const tally = (['STRONG_YES', 'YES', 'NO', 'STRONG_NO'] as const)
                        .map((r) => ({ r, n: cards.filter((s) => s.recommendation === r).length }))
                        .filter((t) => t.n);
                      return (
                        <div>
                          <p>
                            <span className="text-base font-semibold tabular-nums">{scoreOverall[i] ?? '—'}</span>
                            <span className="text-muted-foreground">/5 · {cards.length} scorecard{cards.length === 1 ? '' : 's'}</span>
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {tally.map((t) => (
                              <Badge key={t.r} tone={RECOMMENDATION_META[t.r].tone}>
                                {RECOMMENDATION_META[t.r].label} × {t.n}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  />
                  {criterionAvg.map((cr) => (
                    <Row
                      key={cr.key}
                      label={cr.label}
                      hint="avg score"
                      best={bestOf(cr.values, 'high')}
                      cells={cr.values.map((v) => (v != null ? <span className="tabular-nums">{v} / 5</span> : null))}
                    />
                  ))}
                </>
              )}
              <Row
                label="Feedback"
                best={bestOf(feedbackAvg, 'high')}
                cells={candidates.map((c, i) =>
                  c.feedback?.length ? (
                    <span>
                      {c.feedback.length} note{c.feedback.length === 1 ? '' : 's'}
                      {feedbackAvg[i] != null && <span className="text-muted-foreground"> · avg {feedbackAvg[i]!.toFixed(1)}★</span>}
                    </span>
                  ) : null
                )}
              />
              {jobId && (
                <Row
                  label="Why SWFS submitted"
                  cells={candidates.map((c) => {
                    const l = link(c);
                    return l?.submissionNote ? (
                      <p className="whitespace-pre-wrap text-xs italic text-foreground/80">“{l.submissionNote}”</p>
                    ) : l?.submittedAt ? (
                      `Submitted ${timeAgo(l.submittedAt)}`
                    ) : null;
                  })}
                />
              )}
              {isAdmin && (
                <>
                  <Row
                    label="Expected CTC"
                    hint="internal"
                    best={bestOf(ctc, 'low')}
                    cells={candidates.map((c) => (c.expectedCtc != null ? formatMoney(c.expectedCtc, c.ctcCurrency) : null))}
                  />
                  <Row label="Owner" hint="internal" cells={candidates.map((c) => c.owner?.name)} />
                  <Row label="Source" hint="internal" cells={candidates.map((c) => (c.source ? SOURCE_LABELS[c.source] : null))} />
                </>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-2xs text-subtle-foreground">
        Green marks the strongest value in a row (most experience, soonest start, highest rating{isAdmin ? ', lowest expected CTC' : ''}). Highlighted skills are ones only that candidate has.
      </p>

      {rejecting && jobId && (
        <RejectDialog
          candidateName={`${rejecting.firstName} ${rejecting.lastName}`}
          jobTitle={jobTitle ?? 'this role'}
          loading={reject.isPending}
          onCancel={() => setRejecting(null)}
          onConfirm={(rejection) => reject.mutate({ c: rejecting, rejection })}
        />
      )}
    </AppLayout>
  );
}
