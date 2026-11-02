import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pipelineApi } from '../../api/pipeline.api';
import { queryKeys } from '../../api/queryKeys';
import { useAuth } from '../../context/AuthContext';
import { Scorecard, ScorecardRecommendation, ScorecardTemplate } from '../../types';
import { timeAgo } from '../../utils/format';
import { errorMessage } from '../../utils/errors';
import Modal from '../shared/Modal';
import Button from '../shared/Button';
import Badge, { BadgeTone } from '../shared/Badge';
import Icon from '../shared/Icon';
import { Textarea } from '../shared/Field';
import { useToast } from '../shared/Toast';
import { useConfirm } from '../shared/Confirm';

export const RECOMMENDATION_META: Record<ScorecardRecommendation, { label: string; tone: BadgeTone; value: number }> = {
  STRONG_NO: { label: 'Strong no', tone: 'danger', value: 1 },
  NO: { label: 'No', tone: 'warning', value: 2 },
  YES: { label: 'Yes', tone: 'success', value: 3 },
  STRONG_YES: { label: 'Strong yes', tone: 'success', value: 4 },
};
const RECS: ScorecardRecommendation[] = ['STRONG_NO', 'NO', 'YES', 'STRONG_YES'];
const SCALE_HINT = ['', 'Poor', 'Below bar', 'Meets bar', 'Strong', 'Exceptional'];

function scoreTone(score: number) {
  return score >= 4 ? 'bg-emerald-500' : score >= 3 ? 'bg-sky-500' : score >= 2 ? 'bg-amber-500' : 'bg-rose-500';
}

function ScoreBar({ score, max = 5 }: { score: number | null; max?: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
        {score != null && <div className={`h-full rounded-full ${scoreTone(score)}`} style={{ width: `${(score / max) * 100}%` }} />}
      </div>
      <span className="w-8 text-right text-xs font-semibold tabular-nums text-foreground">{score != null ? score.toFixed(score % 1 ? 1 : 0) : '—'}</span>
    </div>
  );
}

function ScorecardModal({
  template,
  candidateId,
  jobId,
  round,
  candidateName,
  existing,
  onClose,
}: {
  template: ScorecardTemplate;
  candidateId: string;
  jobId: string;
  round: number;
  candidateName: string;
  existing?: Scorecard;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const prev = new Map(existing?.ratings.map((r) => [r.key, r]));
  const [scores, setScores] = useState<Record<string, number | null>>(
    Object.fromEntries(template.criteria.map((c) => [c.key, prev.get(c.key)?.score ?? null]))
  );
  const [comments, setComments] = useState<Record<string, string>>(
    Object.fromEntries(template.criteria.map((c) => [c.key, prev.get(c.key)?.comment ?? '']))
  );
  const [openComment, setOpenComment] = useState<Record<string, boolean>>(
    Object.fromEntries(template.criteria.map((c) => [c.key, !!prev.get(c.key)?.comment]))
  );
  const [recommendation, setRecommendation] = useState<ScorecardRecommendation | ''>(existing?.recommendation ?? '');
  const [summary, setSummary] = useState(existing?.summary ?? '');

  const save = useMutation({
    mutationFn: () =>
      pipelineApi.submitScorecard({
        candidateId,
        jobId,
        round,
        recommendation: recommendation as ScorecardRecommendation,
        summary: summary.trim() || undefined,
        ratings: template.criteria.map((c) => ({ key: c.key, score: scores[c.key], comment: comments[c.key]?.trim() || undefined })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.candidateRecords(candidateId) });
      toast.success(existing ? 'Scorecard updated' : 'Scorecard submitted');
      onClose();
    },
    onError: (err) => toast.error('Couldn’t save the scorecard', errorMessage(err, 'Please try again.')),
  });

  const scoredCount = Object.values(scores).filter((s) => s != null).length;
  const valid = !!recommendation && scoredCount > 0;

  return (
    <Modal
      title={`Round ${round} scorecard`}
      description={`${candidateName} — score what you assessed; skip what you didn’t.`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <span className="mr-auto text-2xs text-subtle-foreground">
            {scoredCount}/{template.criteria.length} criteria scored
          </span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
            {existing ? 'Update scorecard' : 'Submit scorecard'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {template.criteria.map((c) => (
          <div key={c.key} className="rounded-md border border-border p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-foreground">{c.label}</p>
                <p className="text-2xs text-subtle-foreground">{c.description}</p>
              </div>
              <div className="flex items-center gap-1" role="radiogroup" aria-label={c.label}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={scores[c.key] === n}
                    title={SCALE_HINT[n]}
                    onClick={() => setScores((s) => ({ ...s, [c.key]: s[c.key] === n ? null : n }))}
                    className={`h-8 w-8 rounded-md text-xs font-semibold ring-1 ring-inset transition-colors ${
                      scores[c.key] === n ? `${scoreTone(n)} text-white ring-transparent` : 'text-muted-foreground ring-border hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setOpenComment((o) => ({ ...o, [c.key]: !o[c.key] }))}
                  aria-label={`Comment on ${c.label}`}
                  title="Add a comment"
                  className={`ml-1 rounded-md p-1.5 ${openComment[c.key] || comments[c.key] ? 'text-foreground' : 'text-subtle-foreground hover:text-foreground'}`}
                >
                  <Icon name="message" size={14} />
                </button>
              </div>
            </div>
            {scores[c.key] != null && <p className="mt-1 text-right text-2xs text-subtle-foreground">{SCALE_HINT[scores[c.key]!]}</p>}
            {openComment[c.key] && (
              <Textarea
                rows={2}
                className="mt-2"
                value={comments[c.key]}
                onChange={(e) => setComments((m) => ({ ...m, [c.key]: e.target.value }))}
                placeholder="Evidence for this score (optional)"
              />
            )}
          </div>
        ))}

        <div>
          <p className="mb-2 text-[13px] font-medium text-foreground">
            Overall recommendation <span className="text-brand-text">*</span>
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Overall recommendation">
            {RECS.map((r) => {
              const on = recommendation === r;
              const negative = r === 'STRONG_NO' || r === 'NO';
              return (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setRecommendation(r)}
                  className={`rounded-md px-3 py-2 text-[13px] font-medium ring-1 ring-inset transition-colors ${
                    on
                      ? negative
                        ? 'bg-rose-600 text-white ring-transparent'
                        : 'bg-emerald-600 text-white ring-transparent'
                      : 'text-muted-foreground ring-border hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {RECOMMENDATION_META[r].label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[13px] font-medium text-foreground">Summary</p>
          <Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Key strengths, concerns, and anything the next interviewer should probe." />
        </div>
      </div>
    </Modal>
  );
}

/**
 * Structured scorecards for one interview round of one application: the
 * panel's averages per criterion, the recommendation split, each
 * interviewer's card, and a form to add / edit your own. Clients see and
 * score their own roles' interviews; the API scopes everything.
 */
export default function RoundScorecards({
  candidateId,
  candidateName,
  jobId,
  round,
  canAct,
}: {
  candidateId: string;
  candidateName: string;
  jobId: string;
  round: number;
  canAct: boolean;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: records } = useQuery({
    queryKey: queryKeys.candidateRecords(candidateId),
    queryFn: () => pipelineApi.getCandidateRecords(candidateId),
  });
  const { data: template } = useQuery({ queryKey: queryKeys.scorecardTemplate, queryFn: pipelineApi.getScorecardTemplate, staleTime: Infinity });

  const remove = useMutation({
    mutationFn: pipelineApi.deleteScorecard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.candidateRecords(candidateId) });
      toast.success('Scorecard removed');
    },
  });

  const cards = (records?.scorecards ?? []).filter((s) => s.jobId === jobId && s.round === round);
  const mine = cards.find((s) => s.authorEmail.toLowerCase() === user?.email?.toLowerCase());

  // Panel averages per criterion (ignoring "not assessed").
  const criteria = template?.criteria ?? [];
  const avgs = criteria.map((c) => {
    const xs = cards.map((s) => s.ratings.find((r) => r.key === c.key)?.score).filter((x): x is number => x != null);
    return { ...c, avg: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null, n: xs.length };
  });
  const overall = cards.map((s) => s.overall).filter((x): x is number => x != null);
  const overallAvg = overall.length ? overall.reduce((a, b) => a + b, 0) / overall.length : null;
  const tally = RECS.map((r) => ({ r, n: cards.filter((s) => s.recommendation === r).length })).filter((t) => t.n);

  return (
    <div className="mt-4 rounded-md border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/50 px-3 py-2">
        <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <Icon name="check-square" size={13} className="text-subtle-foreground" />
          Scorecards
          {cards.length > 0 && <span className="font-normal text-muted-foreground">· {cards.length} submitted</span>}
          {overallAvg != null && (
            <span className="rounded bg-card px-1.5 py-0.5 font-semibold tabular-nums ring-1 ring-inset ring-border">{overallAvg.toFixed(1)}/5</span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {tally.map((t) => (
            <Badge key={t.r} tone={RECOMMENDATION_META[t.r].tone}>
              {RECOMMENDATION_META[t.r].label} × {t.n}
            </Badge>
          ))}
          {canAct && template && (
            <Button size="sm" variant={mine ? 'ghost' : 'secondary'} icon={mine ? 'edit' : 'plus'} onClick={() => setEditing(true)}>
              {mine ? 'Edit my scorecard' : 'Fill scorecard'}
            </Button>
          )}
        </div>
      </div>

      {cards.length === 0 ? (
        <p className="px-3 py-3 text-xs text-subtle-foreground">
          No scorecards yet.{canAct ? ' Each interviewer fills one — it keeps feedback comparable across candidates.' : ''}
        </p>
      ) : (
        <>
          {cards.length > 1 && (
            <div className="grid gap-x-6 gap-y-1.5 border-b border-border px-3 py-3 sm:grid-cols-2">
              {avgs.map((a) => (
                <div key={a.key} className="flex items-center justify-between gap-3">
                  <span className="truncate text-xs text-muted-foreground" title={a.description}>
                    {a.label}
                  </span>
                  <ScoreBar score={a.avg} />
                </div>
              ))}
            </div>
          )}
          <ul className="divide-y divide-border">
            {cards.map((s) => {
              const open = expanded === s.id || cards.length === 1;
              const isMine = s === mine;
              return (
                <li key={s.id} className="px-3 py-2.5">
                  <button type="button" onClick={() => setExpanded(open && cards.length > 1 ? null : s.id)} className="flex w-full flex-wrap items-center gap-2 text-left">
                    <span className="text-[13px] font-medium text-foreground">{s.authorName}</span>
                    <span className="text-2xs text-subtle-foreground">
                      {s.authorRole === 'ADMIN' ? 'SWFS' : 'Client'} · {timeAgo(s.updatedAt)}
                    </span>
                    <Badge tone={RECOMMENDATION_META[s.recommendation].tone} className="ml-auto">
                      {RECOMMENDATION_META[s.recommendation].label}
                    </Badge>
                    {s.overall != null && <span className="text-xs font-semibold tabular-nums text-foreground">{s.overall}/5</span>}
                    {cards.length > 1 && <Icon name="chevron-down" size={13} className={`text-subtle-foreground transition-transform ${open ? '' : '-rotate-90'}`} />}
                  </button>
                  {open && (
                    <div className="mt-2 space-y-1.5">
                      {s.ratings.map((r) => (
                        <div key={r.key}>
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-xs text-muted-foreground">{r.label}</span>
                            <ScoreBar score={r.score} />
                          </div>
                          {r.comment && <p className="mt-0.5 text-2xs italic text-subtle-foreground">“{r.comment}”</p>}
                        </div>
                      ))}
                      {s.summary && <p className="mt-2 whitespace-pre-wrap rounded bg-muted/60 px-2.5 py-2 text-xs text-foreground">{s.summary}</p>}
                      {isMine && (
                        <div className="flex justify-end gap-1 pt-1">
                          <Button size="sm" variant="ghost" icon="edit" onClick={() => setEditing(true)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon="trash"
                            onClick={async () => {
                              if (await confirm({ title: 'Delete your scorecard?', confirmLabel: 'Delete', tone: 'danger' })) remove.mutate(s.id);
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {editing && template && (
        <ScorecardModal
          template={template}
          candidateId={candidateId}
          jobId={jobId}
          round={round}
          candidateName={candidateName}
          existing={mine}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
