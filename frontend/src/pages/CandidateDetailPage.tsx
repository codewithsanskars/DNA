import { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AppLayout from '../components/layout/AppLayout';
import Badge, { StageBadge, GlobalStatusBadge, CandidateStatusBadge } from '../components/shared/Badge';
import Button from '../components/shared/Button';
import Avatar from '../components/shared/Avatar';
import { CenteredSpinner } from '../components/shared/LoadingSpinner';
import { ErrorState, EmptyState } from '../components/shared/States';
import { Field, Input, Textarea, Select } from '../components/shared/Field';
import Modal from '../components/shared/Modal';
import Icon from '../components/shared/Icon';
import SelectedCandidateActions from '../components/candidates/SelectedCandidateActions';
import { candidateApi } from '../api/candidate.api';
import { queryKeys } from '../api/queryKeys';
import { useJobs } from '../hooks/useJobs';
import { useAuth } from '../context/AuthContext';
import { humanize, formatDateTime } from '../utils/format';
import { useToast } from '../components/shared/Toast';
import { useConfirm } from '../components/shared/Confirm';
import { isAdminRole } from '../utils/roles';

const CAN_ACT_ROLES = ['ADMIN', 'CLIENT'];
const RESUME_ACCEPT = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function Stars({ value }: { value: number }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((r) => (
        <Icon
          key={r}
          name="star"
          size={13}
          className={r <= value ? 'fill-current text-amber-400' : 'text-border-strong'}
        />
      ))}
    </span>
  );
}

function SectionTitle({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-foreground">
      {children}
      {count !== undefined && (
        <span className="rounded-full bg-muted px-1.5 text-2xs font-medium text-muted-foreground ring-1 ring-inset ring-border">
          {count}
        </span>
      )}
    </h3>
  );
}

export default function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const canAct = CAN_ACT_ROLES.includes(user?.role || '');
  const canManageResume = isAdminRole(user?.role);

  const [feedback, setFeedback] = useState('');
  const [rating, setRating] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [activeRoundFeedback, setActiveRoundFeedback] = useState<{ jobId: string; round: number } | null>(null);
  const [roundFeedbackText, setRoundFeedbackText] = useState('');
  const [roundFeedbackRating, setRoundFeedbackRating] = useState(0);
  const [linkJobId, setLinkJobId] = useState('');
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const [downloadingResume, setDownloadingResume] = useState(false);
  const [viewingResume, setViewingResume] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    currentTitle: '',
    currentCompany: '',
    location: '',
    skills: '',
    linkedinUrl: '',
    website: '',
    notes: '',
  });

  const { data: candidate, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.candidate(id!),
    queryFn: () => candidateApi.getCandidate(id!),
    enabled: !!id,
  });

  const { data: jobs } = useJobs();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.candidate(id!) });
    queryClient.invalidateQueries({ queryKey: queryKeys.candidates });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
  };

  const withPending = (jobId: string, fn: () => Promise<unknown>) => {
    setPendingJobId(jobId);
    return fn().finally(() => setPendingJobId(null));
  };

  const fail = (msg: string) => () => toast.error(msg, 'Please try again.');

  const shortlist = useMutation({
    mutationFn: (jobId: string) => withPending(jobId, () => candidateApi.shortlist(id!, jobId)),
    onSuccess: () => {
      invalidate();
      toast.success('Candidate shortlisted');
    },
    onError: fail('Couldn’t shortlist candidate'),
  });

  const reject = useMutation({
    mutationFn: (jobId: string) => withPending(jobId, () => candidateApi.reject(id!, jobId)),
    onSuccess: () => {
      invalidate();
      toast.success('Candidate rejected');
    },
    onError: fail('Couldn’t reject candidate'),
  });

  const requestInterview = useMutation({
    mutationFn: (jobId: string) =>
      withPending(jobId, () =>
        candidateApi.requestInterview(id!, jobId, { notes: 'Interview requested via portal' })
      ),
    onSuccess: () => {
      invalidate();
      toast.success('Interview scheduled');
    },
    onError: fail('Couldn’t schedule the interview'),
  });

  const submitInterviewFeedback = useMutation({
    mutationFn: () => {
      if (!activeRoundFeedback) return Promise.reject(new Error('No active round'));
      return candidateApi.submitInterviewFeedback(
        id!,
        activeRoundFeedback.jobId,
        activeRoundFeedback.round,
        roundFeedbackText,
        roundFeedbackRating || undefined
      );
    },
    onSuccess: () => {
      setActiveRoundFeedback(null);
      setRoundFeedbackText('');
      setRoundFeedbackRating(0);
      invalidate();
      toast.success('Interview feedback submitted');
    },
    onError: fail('Couldn’t submit interview feedback'),
  });

  const linkToJob = useMutation({
    mutationFn: () => candidateApi.linkToJob(id!, linkJobId),
    onSuccess: () => {
      setLinkJobId('');
      invalidate();
      toast.success('Linked to role');
    },
    onError: fail('Couldn’t link this candidate'),
  });

  const updateCandidate = useMutation({
    mutationFn: () =>
      candidateApi.updateCandidate(id!, {
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        email: editForm.email.trim() || undefined,
        phone: editForm.phone.trim() || undefined,
        currentTitle: editForm.currentTitle.trim() || undefined,
        currentCompany: editForm.currentCompany.trim() || undefined,
        location: editForm.location.trim() || undefined,
        skills: editForm.skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        linkedinUrl: editForm.linkedinUrl.trim() || undefined,
        website: editForm.website.trim() || undefined,
        notes: editForm.notes.trim() || undefined,
      }),
    onSuccess: () => {
      setShowEditModal(false);
      invalidate();
      toast.success('Candidate updated');
    },
    onError: fail('Couldn’t update this candidate'),
  });

  const openEditModal = () => {
    if (!candidate) return;
    setEditForm({
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email || '',
      phone: candidate.phone || '',
      currentTitle: candidate.currentTitle || '',
      currentCompany: candidate.currentCompany || '',
      location: candidate.location || '',
      skills: candidate.skills.join(', '),
      linkedinUrl: candidate.linkedinUrl || '',
      website: candidate.website || '',
      notes: candidate.notes || '',
    });
    setShowEditModal(true);
  };

  const uploadResume = useMutation({
    mutationFn: (file: File) => candidateApi.uploadResume(id!, file),
    onSuccess: () => {
      invalidate();
      toast.success('Resume attached');
    },
    onError: fail('Couldn’t attach that resume'),
  });

  const deleteResume = useMutation({
    mutationFn: () => candidateApi.deleteResume(id!),
    onSuccess: () => {
      invalidate();
      toast.success('Resume removed');
    },
    onError: fail('Couldn’t remove the resume'),
  });

  const handleResumeFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/\.(pdf|docx)$/i.test(file.name)) {
      toast.error('Résumé must be a .pdf or .docx file');
      return;
    }
    uploadResume.mutate(file);
  };

  const handleDownloadResume = async () => {
    if (!candidate) return;
    setDownloadingResume(true);
    try {
      await candidateApi.downloadResume(candidate._id, candidate.resumeFileName);
    } catch {
      toast.error('Couldn’t download résumé', 'Please try again.');
    } finally {
      setDownloadingResume(false);
    }
  };

  const handleViewResume = async () => {
    if (!candidate) return;
    // Open the tab synchronously, inside the click gesture, so the browser
    // doesn't treat it as a popup once the fetch below resolves.
    const tab = window.open('', '_blank');
    setViewingResume(true);
    try {
      await candidateApi.viewResume(candidate._id, tab);
    } catch {
      tab?.close();
      toast.error('Couldn’t open résumé', 'Please try again.');
    } finally {
      setViewingResume(false);
    }
  };

  const confirmDeleteResume = async () => {
    const ok = await confirm({
      title: 'Remove résumé?',
      description: `This removes the attached résumé from ${candidate?.firstName} ${candidate?.lastName}'s profile.`,
      confirmLabel: 'Remove résumé',
      tone: 'danger',
    });
    if (ok) deleteResume.mutate();
  };

  const submitFeedback = useMutation({
    mutationFn: () => candidateApi.submitFeedback(id!, feedback, rating || undefined),
    onSuccess: () => {
      setShowFeedback(false);
      setFeedback('');
      setRating(0);
      invalidate();
      toast.success('Feedback submitted');
    },
    onError: fail('Couldn’t submit feedback'),
  });

  // Opens Google Calendar's "new event" composer prefilled for this interview
  // round — frontend-only, no Calendar API/backend integration. Fire-and-
  // forget: we advance the round as soon as this is clicked, regardless of
  // whether the user actually finishes creating the event in the new tab.
  const scheduleGoogleCalendar = (jobTitle: string, round: number) => {
    if (!candidate) return;
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: `Interview Round ${round}: ${fullName} — ${jobTitle}`,
      details: `Interview round ${round} with ${fullName} for the ${jobTitle} role.`,
    });
    if (candidate.email) params.set('add', candidate.email);
    window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, '_blank', 'noopener');
  };

  const handleScheduleRound = (jobId: string, jobTitle: string, round: number) => {
    scheduleGoogleCalendar(jobTitle, round);
    requestInterview.mutate(jobId);
  };

  const handleRollOutOffer = () => {
    toast.info('Coming soon', 'Rolling out offer letters isn’t built yet.');
  };

  const confirmReject = async (jobId: string, jobTitle: string) => {
    const ok = await confirm({
      title: 'Reject candidate?',
      description: (
        <>
          <span className="font-medium text-foreground">
            {candidate?.firstName} {candidate?.lastName}
          </span>{' '}
          will be moved to Rejected for <span className="font-medium text-foreground">{jobTitle}</span>.
          You can shortlist them again later.
        </>
      ),
      confirmLabel: 'Reject candidate',
      tone: 'danger',
    });
    if (ok) reject.mutate(jobId);
  };

  if (isLoading) {
    return (
      <AppLayout title="Candidate" backTo="/candidates" backLabel="Back to candidates">
        <CenteredSpinner />
      </AppLayout>
    );
  }

  if (error || !candidate) {
    return (
      <AppLayout title="Candidate" backTo="/candidates" backLabel="Back to candidates">
        <ErrorState
          title="Candidate not found"
          description="This candidate may have been removed or you don’t have access."
          onRetry={() => refetch()}
        />
      </AppLayout>
    );
  }

  const fullName = `${candidate.firstName} ${candidate.lastName}`;
  const feedbackList = candidate.feedback ?? [];
  const isArchived = candidate.globalStatus === 'ARCHIVED';
  const linkedJobIds = new Set(candidate.jobLinks.map((l) => l.jobId));
  const availableJobs = (jobs || []).filter((j) => !linkedJobIds.has(j._id));

  // One card per (job link, round) pair that's been scheduled so far — cards
  // accumulate as rounds progress and never disappear once a round is added.
  const roundCards = candidate.jobLinks.flatMap((link) =>
    Array.from({ length: link.interviewRound }, (_, i) => i + 1).map((round) => ({
      jobId: link.jobId,
      jobTitle: link.jobTitle,
      round,
      entries: link.interviewFeedback.filter((f) => f.round === round),
    }))
  );

  return (
    <AppLayout
      title={fullName}
      backTo={`/candidates?tab=${candidate.globalStatus}`}
      backLabel="Back to candidates"
    >
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main profile */}
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-lg border border-border bg-card p-5 shadow-xs">
            <div className="flex items-start gap-4">
              <Avatar name={candidate.firstName} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-foreground">{fullName}</h2>
                      {candidate.source === 'LINKEDIN' && (
                        <Badge tone="info">
                          <Icon name="linkedin" size={11} /> Sourced
                        </Badge>
                      )}
                      <GlobalStatusBadge status={candidate.globalStatus} />
                      {candidate.globalStatus !== 'OPEN' && candidate.globalStatus !== 'SELECTED' && (
                        <CandidateStatusBadge status={candidate.status} />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {candidate.currentTitle}
                      {candidate.currentCompany && ` · ${candidate.currentCompany}`}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {candidate.location && (
                        <span className="inline-flex items-center gap-1.5">
                          <Icon name="pin" size={13} /> {candidate.location}
                        </span>
                      )}
                      {candidate.email && (
                        <a
                          href={`mailto:${candidate.email}`}
                          className="inline-flex items-center gap-1.5 hover:text-foreground"
                        >
                          <Icon name="mail" size={13} /> {candidate.email}
                        </a>
                      )}
                    </div>
                  </div>
                  {canManageResume && (
                    <Button variant="danger" size="sm" onClick={openEditModal} className="shrink-0">
                      Edit
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {candidate.skills.length > 0 && (
              <div className="mt-5 border-t border-border pt-4">
                <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle-foreground">
                  Skills
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {candidate.skills.map((s) => (
                    <span
                      key={s}
                      className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground ring-1 ring-inset ring-border"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(candidate.linkedinUrl || candidate.website || candidate.resumeUrl) && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {candidate.linkedinUrl && (
                  <a href={candidate.linkedinUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="secondary" size="sm" iconRight="external">
                      LinkedIn
                    </Button>
                  </a>
                )}
                {candidate.website && (
                  <a href={candidate.website} target="_blank" rel="noopener noreferrer">
                    <Button variant="secondary" size="sm" iconRight="external">
                      Website
                    </Button>
                  </a>
                )}
                {candidate.resumeUrl && (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="external"
                      onClick={handleViewResume}
                      loading={viewingResume}
                    >
                      {candidate.resumeFileName || 'Résumé'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="download"
                      onClick={handleDownloadResume}
                      loading={downloadingResume}
                    >
                      Download
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Feedback / Comments */}
          <div className="rounded-lg border border-border bg-card p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                {isArchived ? 'Comments' : 'Feedback'}
                {feedbackList.length > 0 && (
                  <span className="rounded-full bg-muted px-1.5 text-2xs font-medium text-muted-foreground ring-1 ring-inset ring-border">
                    {feedbackList.length}
                  </span>
                )}
              </h3>
              {canAct && !showFeedback && (
                <Button variant="ghost" size="sm" icon="plus" onClick={() => setShowFeedback(true)}>
                  {isArchived ? 'Add comment' : 'Add feedback'}
                </Button>
              )}
            </div>

            {canAct && showFeedback && (
              <div className="mt-4 space-y-3 rounded-md border border-border bg-background p-3">
                <Textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder={
                    isArchived ? 'Leave a comment about this candidate…' : 'Share your assessment of this candidate…'
                  }
                  rows={3}
                  autoFocus
                />
                {!isArchived && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Rating</span>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((r) => (
                        <button
                          key={r}
                          type="button"
                          aria-label={`${r} star${r > 1 ? 's' : ''}`}
                          onClick={() => setRating(r === rating ? 0 : r)}
                          className={`transition-colors ${
                            r <= rating ? 'text-amber-400' : 'text-border-strong hover:text-amber-400/60'
                          }`}
                        >
                          <Icon name="star" size={18} className={r <= rating ? 'fill-current' : ''} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {submitFeedback.isError && (
                  <p className="text-xs text-brand-text">
                    Couldn’t submit {isArchived ? 'comment' : 'feedback'}. Please try again.
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => submitFeedback.mutate()}
                    disabled={!feedback.trim()}
                    loading={submitFeedback.isPending}
                  >
                    {submitFeedback.isPending
                      ? 'Submitting…'
                      : isArchived
                        ? 'Submit comment'
                        : 'Submit feedback'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowFeedback(false);
                      setFeedback('');
                      setRating(0);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {feedbackList.length > 0 ? (
              <ul className="mt-4 space-y-3">
                {feedbackList.map((f) => (
                  <li key={f.id} className="rounded-md border border-border bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar name={f.author} size="xs" />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-foreground">{f.author}</p>
                          <p className="text-2xs text-subtle-foreground">
                            {f.authorRole ? `${humanize(f.authorRole)} · ` : ''}
                            {formatDateTime(f.createdAt)}
                          </p>
                        </div>
                      </div>
                      {!isArchived && f.rating ? <Stars value={f.rating} /> : null}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
                      {f.comment}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              !showFeedback && (
                <p className="mt-3 text-[13px] text-muted-foreground">
                  {canAct
                    ? isArchived
                      ? 'No comments yet'
                      : 'No feedback yet'
                    : isArchived
                      ? 'No comments have been shared for this candidate yet.'
                      : 'No feedback has been shared for this candidate yet.'}
                </p>
              )
            )}
          </div>

          {roundCards.map(({ jobId, jobTitle, round, entries }) => {
            const isOpen = activeRoundFeedback?.jobId === jobId && activeRoundFeedback?.round === round;
            return (
              <div key={`${jobId}-${round}`} className="rounded-lg border border-border bg-card p-5 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-foreground">
                    <span className="truncate">
                      Interview {round} feedback <span className="font-normal text-subtle-foreground">— {jobTitle}</span>
                    </span>
                    {entries.length > 0 && (
                      <span className="shrink-0 rounded-full bg-muted px-1.5 text-2xs font-medium text-muted-foreground ring-1 ring-inset ring-border">
                        {entries.length}
                      </span>
                    )}
                  </h3>
                  {canAct && !isOpen && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="plus"
                      className="shrink-0"
                      onClick={() => setActiveRoundFeedback({ jobId, round })}
                    >
                      Add Interview {round} feedback
                    </Button>
                  )}
                </div>

                {canAct && isOpen && (
                  <div className="mt-4 space-y-3 rounded-md border border-border bg-background p-3">
                    <Textarea
                      value={roundFeedbackText}
                      onChange={(e) => setRoundFeedbackText(e.target.value)}
                      placeholder={`Share your assessment of round ${round}…`}
                      rows={3}
                      autoFocus
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Rating</span>
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((r) => (
                          <button
                            key={r}
                            type="button"
                            aria-label={`${r} star${r > 1 ? 's' : ''}`}
                            onClick={() => setRoundFeedbackRating(r === roundFeedbackRating ? 0 : r)}
                            className={`transition-colors ${
                              r <= roundFeedbackRating ? 'text-amber-400' : 'text-border-strong hover:text-amber-400/60'
                            }`}
                          >
                            <Icon name="star" size={18} className={r <= roundFeedbackRating ? 'fill-current' : ''} />
                          </button>
                        ))}
                      </div>
                    </div>
                    {submitInterviewFeedback.isError && (
                      <p className="text-xs text-brand-text">Couldn’t submit feedback. Please try again.</p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => submitInterviewFeedback.mutate()}
                        disabled={!roundFeedbackText.trim()}
                        loading={submitInterviewFeedback.isPending}
                      >
                        {submitInterviewFeedback.isPending ? 'Submitting…' : 'Submit feedback'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setActiveRoundFeedback(null);
                          setRoundFeedbackText('');
                          setRoundFeedbackRating(0);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {entries.length > 0 ? (
                  <ul className="mt-4 space-y-3">
                    {entries.map((f) => (
                      <li key={f.id} className="rounded-md border border-border bg-background p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <Avatar name={f.author} size="xs" />
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-medium text-foreground">{f.author}</p>
                              <p className="text-2xs text-subtle-foreground">
                                {f.authorRole ? `${humanize(f.authorRole)} · ` : ''}
                                {formatDateTime(f.createdAt)}
                              </p>
                            </div>
                          </div>
                          {f.rating ? <Stars value={f.rating} /> : null}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
                          {f.comment}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  !isOpen && (
                    <p className="mt-3 text-[13px] text-muted-foreground">
                      {canAct ? 'No feedback yet for this round.' : 'No feedback has been shared for this round yet.'}
                    </p>
                  )
                )}
              </div>
            );
          })}
        </div>

        {/* Linked positions */}
        {!isArchived && (
        <div className="space-y-6">
          {canManageResume && candidate.globalStatus === 'SELECTED' && (
            <SelectedCandidateActions candidateId={candidate._id} candidateName={fullName} />
          )}
          <div>
            <SectionTitle count={candidate.globalStatus === 'SELECTED' ? undefined : candidate.jobLinks.length}>
              {candidate.globalStatus === 'SELECTED' ? 'Position selected for' : 'Linked roles'}
            </SectionTitle>

            {candidate.globalStatus === 'SELECTED' ? (
              <div className="rounded-lg border border-dashed border-border bg-card">
                <EmptyState icon="briefcase" title="No position yet" className="py-10" />
              </div>
            ) : candidate.jobLinks.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-card">
                <EmptyState
                  icon="briefcase"
                  title="Not linked to any role"
                  description="Link this candidate to a role to start their pipeline."
                  className="py-10"
                />
              </div>
            ) : (
              <div className="space-y-3">
                {candidate.jobLinks.map((link) => {
                  const isPending = pendingJobId === link.jobId;
                  return (
                    <div
                      key={link.jobId}
                      className="rounded-lg border border-border bg-card p-3.5 shadow-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-foreground">{link.jobTitle}</p>
                        <StageBadge stage={link.stage} />
                      </div>
                      {canAct && !['REJECTED', 'OFFER', 'HIRED'].includes(link.stage) && (
                        <div className="mt-3 grid grid-cols-2 gap-1.5">
                          {link.stage !== 'SHORTLISTED' && link.interviewRound === 0 ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => shortlist.mutate(link.jobId)}
                              disabled={isPending}
                            >
                              Shortlist
                            </Button>
                          ) : link.interviewRound < 3 ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              icon="calendar"
                              onClick={() =>
                                handleScheduleRound(link.jobId, link.jobTitle, link.interviewRound + 1)
                              }
                              disabled={isPending}
                            >
                              {link.interviewRound === 0 ? 'Interview' : `Schedule round ${link.interviewRound + 1}`}
                            </Button>
                          ) : (
                            <Button variant="primary" size="sm" onClick={handleRollOutOffer} disabled={isPending}>
                              Roll out offer letter
                            </Button>
                          )}
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => confirmReject(link.jobId, link.jobTitle)}
                            disabled={isPending}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {canAct && candidate.globalStatus !== 'SELECTED' && availableJobs.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
              <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle-foreground">
                Link to another role
              </p>
              <div className="flex gap-2">
                <Select
                  value={linkJobId}
                  onChange={(e) => setLinkJobId(e.target.value)}
                  className="flex-1"
                >
                  <option value="">Select a role…</option>
                  {availableJobs.map((j) => (
                    <option key={j._id} value={j._id}>
                      {j.title}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => linkToJob.mutate()}
                  disabled={!linkJobId}
                  loading={linkToJob.isPending}
                >
                  Link
                </Button>
              </div>
            </div>
          )}
        </div>
        )}

        {/* Archived candidates get Actions/History in place of the pipeline panel */}
        {isArchived && (
          <div className="space-y-6">
            <div>
              <SectionTitle>Actions</SectionTitle>
              <div className="rounded-lg border border-dashed border-border bg-card">
                <EmptyState
                  icon="settings"
                  title="No actions yet"
                  description="Actions for archived candidates will show up here."
                  className="py-10"
                />
              </div>
            </div>

            <div>
              <SectionTitle>History</SectionTitle>
              <div className="rounded-lg border border-dashed border-border bg-card">
                <EmptyState
                  icon="activity"
                  title="No history yet"
                  description="This candidate's history will show up here."
                  className="py-10"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {showEditModal && (
        <Modal
          title="Edit candidate"
          description="Update this candidate's details."
          onClose={() => setShowEditModal(false)}
          size="full"
          centered
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" required>
                {(fid) => (
                  <Input
                    id={fid}
                    value={editForm.firstName}
                    onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                    required
                  />
                )}
              </Field>
              <Field label="Last name" required>
                {(fid) => (
                  <Input
                    id={fid}
                    value={editForm.lastName}
                    onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                    required
                  />
                )}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email">
                {(fid) => (
                  <Input
                    id={fid}
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  />
                )}
              </Field>
              <Field label="Phone">
                {(fid) => (
                  <Input
                    id={fid}
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  />
                )}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Current designation">
                {(fid) => (
                  <Input
                    id={fid}
                    value={editForm.currentTitle}
                    onChange={(e) => setEditForm({ ...editForm, currentTitle: e.target.value })}
                  />
                )}
              </Field>
              <Field label="Current company">
                {(fid) => (
                  <Input
                    id={fid}
                    value={editForm.currentCompany}
                    onChange={(e) => setEditForm({ ...editForm, currentCompany: e.target.value })}
                  />
                )}
              </Field>
            </div>

            <Field label="Location">
              {(fid) => (
                <Input
                  id={fid}
                  value={editForm.location}
                  onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                />
              )}
            </Field>

            <Field label="Skills" hint="comma-separated">
              {(fid) => (
                <Input
                  id={fid}
                  value={editForm.skills}
                  onChange={(e) => setEditForm({ ...editForm, skills: e.target.value })}
                  placeholder="e.g. React, Node.js, SQL"
                />
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="LinkedIn URL">
                {(fid) => (
                  <Input
                    id={fid}
                    value={editForm.linkedinUrl}
                    onChange={(e) => setEditForm({ ...editForm, linkedinUrl: e.target.value })}
                    placeholder="https://linkedin.com/in/…"
                  />
                )}
              </Field>
              <Field label="Website">
                {(fid) => (
                  <Input
                    id={fid}
                    value={editForm.website}
                    onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                    placeholder="https://…"
                  />
                )}
              </Field>
            </div>

            <Field label="Notes">
              {(fid) => (
                <Textarea
                  id={fid}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  rows={3}
                />
              )}
            </Field>

            <div className="border-t border-border pt-4">
              <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle-foreground">
                Résumé
              </p>
              {candidate.resumeUrl ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="external"
                    onClick={handleViewResume}
                    loading={viewingResume}
                  >
                    {candidate.resumeFileName || 'Résumé'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="upload"
                    onClick={() => resumeInputRef.current?.click()}
                    loading={uploadResume.isPending}
                  >
                    Replace
                  </Button>
                  <Button variant="ghost" size="sm" icon="trash" onClick={confirmDeleteResume}>
                    Remove
                  </Button>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  icon="upload"
                  onClick={() => resumeInputRef.current?.click()}
                  loading={uploadResume.isPending}
                >
                  Attach résumé
                </Button>
              )}
              <input
                ref={resumeInputRef}
                type="file"
                accept={RESUME_ACCEPT}
                className="hidden"
                onChange={handleResumeFile}
              />
            </div>

            {updateCandidate.isError && (
              <p className="text-xs text-brand-text">Couldn’t update this candidate. Please try again.</p>
            )}

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="ghost" onClick={() => setShowEditModal(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => updateCandidate.mutate()}
                disabled={!editForm.firstName.trim() || !editForm.lastName.trim()}
                loading={updateCandidate.isPending}
              >
                {updateCandidate.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </AppLayout>
  );
}
