import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { candidateApi } from '../../api/candidate.api';
import { queryKeys } from '../../api/queryKeys';
import { Candidate, CandidateStage, RejectionReason } from '../../types';
import { humanize, timeAgo } from '../../utils/format';
import { REJECTION_LABELS } from '../../utils/labels';
import { errorMessage } from '../../utils/errors';
import CandidateAvatar from './CandidateAvatar';
import RejectDialog from './RejectDialog';
import Icon from '../shared/Icon';
import { useToast } from '../shared/Toast';
import { useConfirm } from '../shared/Confirm';

const COLUMNS: CandidateStage[] = ['APPLIED', 'SCREENING', 'SUBMITTED', 'SHORTLISTED', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'];
/** Mirrors the backend rule in candidateService.setStage. */
const CLIENT_TARGETS = new Set<CandidateStage>(['SHORTLISTED', 'INTERVIEW', 'OFFER', 'REJECTED']);
const STALE_DAYS = 14;

/**
 * Drag-and-drop pipeline board for one role (RC-43). Dropping a card on a
 * column moves that application's stage; Rejected asks for a reason, Offer
 * runs the select flow. Columns a client can't move into are dimmed.
 */
export default function KanbanBoard({ jobId, candidates, isAdmin }: { jobId: string; candidates: Candidate[]; isAdmin: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<CandidateStage | null>(null);
  const [rejecting, setRejecting] = useState<Candidate | null>(null);
  // Optimistic stage overrides so the card lands immediately (AT-32).
  const [optimistic, setOptimistic] = useState<Record<string, CandidateStage>>({});

  const move = useMutation({
    mutationFn: (v: { candidate: Candidate; stage: CandidateStage; rejection?: { rejectionReason: RejectionReason; rejectionNote?: string } }) =>
      candidateApi.setStage(v.candidate._id, jobId, v.stage, v.rejection),
    onMutate: (v) => setOptimistic((o) => ({ ...o, [v.candidate._id]: v.stage })),
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.candidates });
      queryClient.invalidateQueries({ queryKey: queryKeys.jobPipeline(jobId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.candidate(v.candidate._id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      toast.success(`${v.candidate.firstName} moved to ${humanize(v.stage)}`);
    },
    onError: (err, v) => {
      // Roll the card back to where it was.
      setOptimistic((o) => {
        const { [v.candidate._id]: _drop, ...rest } = o;
        return rest;
      });
      toast.error('Couldn’t move candidate', errorMessage(err, 'Please try again.'));
    },
    onSettled: (_d, _e, v) =>
      setTimeout(
        () =>
          setOptimistic((o) => {
            const { [v.candidate._id]: _drop, ...rest } = o;
            return rest;
          }),
        1500
      ),
  });

  const stageOf = (c: Candidate) => optimistic[c._id] ?? c.jobLinks.find((l) => l.jobId === jobId)?.stage ?? 'APPLIED';
  const canDropOn = (stage: CandidateStage) => isAdmin || CLIENT_TARGETS.has(stage);

  const drop = async (stage: CandidateStage) => {
    const c = candidates.find((x) => x._id === dragId);
    setDragId(null);
    setOverCol(null);
    if (!c || stageOf(c) === stage || !canDropOn(stage)) return;
    if (stage === 'REJECTED') return setRejecting(c);
    if (stage === 'OFFER') {
      const ok = await confirm({
        title: `Select ${c.firstName} ${c.lastName}?`,
        description: 'Moving to Offer marks the candidate as Selected for this role. You can record the offer details from their profile.',
        confirmLabel: 'Select candidate',
      });
      if (!ok) return;
    }
    move.mutate({ candidate: c, stage });
  };

  return (
    <>
      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
        <div className="flex min-w-max gap-3">
          {COLUMNS.map((stage) => {
            const cards = candidates.filter((c) => stageOf(c) === stage);
            const allowed = canDropOn(stage);
            const isOver = overCol === stage && dragId !== null;
            return (
              <section
                key={stage}
                aria-label={`${humanize(stage)} column`}
                onDragOver={(e) => {
                  if (!allowed) return;
                  e.preventDefault();
                  setOverCol(stage);
                }}
                onDragLeave={() => setOverCol((s) => (s === stage ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  drop(stage);
                }}
                className={`flex w-64 shrink-0 flex-col rounded-lg border bg-muted/50 transition-colors ${
                  isOver ? 'border-brand/60 bg-brand-subtle/40' : 'border-border'
                } ${dragId && !allowed ? 'opacity-40' : ''}`}
              >
                <header className="flex items-center justify-between px-3 py-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{humanize(stage)}</h3>
                  <span className="rounded-full bg-card px-1.5 text-2xs font-medium text-muted-foreground ring-1 ring-inset ring-border">{cards.length}</span>
                </header>
                <div className="flex min-h-[120px] flex-1 flex-col gap-2 px-2 pb-2">
                  {cards.map((c) => {
                    const link = c.jobLinks.find((l) => l.jobId === jobId);
                    const since = link?.stageUpdatedAt;
                    const stale = since && (Date.now() - new Date(since).getTime()) / 86_400_000 > STALE_DAYS && !['HIRED', 'REJECTED'].includes(stage);
                    return (
                      <article
                        key={c._id}
                        draggable
                        onDragStart={(e) => {
                          setDragId(c._id);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverCol(null);
                        }}
                        onClick={() => navigate(`/candidates/${c._id}`)}
                        className={`cursor-grab rounded-md border border-border bg-card p-2.5 shadow-xs transition-shadow hover:shadow-md active:cursor-grabbing ${
                          dragId === c._id ? 'opacity-50' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <CandidateAvatar candidateId={c._id} name={c.firstName} photoUrl={c.photoUrl} version={c.syncedAt} />
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium text-foreground">
                              {c.firstName} {c.lastName}
                            </p>
                            <p className="truncate text-2xs text-subtle-foreground">{c.currentTitle || c.location || '—'}</p>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-subtle-foreground">
                          {stage === 'INTERVIEW' && link?.interviewRound ? <span>Round {link.interviewRound}</span> : null}
                          {c.yearsExperience != null && <span>{c.yearsExperience}y exp</span>}
                          {since && (
                            <span className={`inline-flex items-center gap-0.5 ${stale ? 'font-medium text-amber-700 dark:text-amber-400' : ''}`}>
                              <Icon name="clock" size={10} /> {timeAgo(since)}
                            </span>
                          )}
                          {stage === 'REJECTED' && link?.rejectionReason && <span>{REJECTION_LABELS[link.rejectionReason]}</span>}
                          {stage === 'SUBMITTED' &&
                            (link?.clientViewedAt ? (
                              isAdmin && <span className="font-medium text-emerald-700 dark:text-emerald-400">Viewed by client</span>
                            ) : isAdmin ? (
                              <span>Not yet viewed</span>
                            ) : (
                              <span className="rounded bg-brand px-1 font-semibold text-white">New</span>
                            ))}
                        </div>
                      </article>
                    );
                  })}
                  {!cards.length && (
                    <p className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border py-6 text-2xs text-subtle-foreground">
                      {allowed ? 'Drop here' : 'SWFS only'}
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      {rejecting && (
        <RejectDialog
          candidateName={`${rejecting.firstName} ${rejecting.lastName}`}
          jobTitle={rejecting.jobLinks.find((l) => l.jobId === jobId)?.jobTitle ?? 'this role'}
          loading={move.isPending}
          onCancel={() => setRejecting(null)}
          onConfirm={(rejection) => {
            move.mutate({ candidate: rejecting, stage: 'REJECTED', rejection });
            setRejecting(null);
          }}
        />
      )}
    </>
  );
}
