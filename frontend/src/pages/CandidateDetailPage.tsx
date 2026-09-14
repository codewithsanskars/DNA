import { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AppLayout from '../components/layout/AppLayout';
import Badge, { StageBadge } from '../components/shared/Badge';
import Button from '../components/shared/Button';
import Avatar from '../components/shared/Avatar';
import { CenteredSpinner } from '../components/shared/LoadingSpinner';
import { ErrorState, EmptyState } from '../components/shared/States';
import { Textarea, Select } from '../components/shared/Field';
import Icon from '../components/shared/Icon';
import { candidateApi } from '../api/candidate.api';
import { queryKeys } from '../api/queryKeys';
import { useJobs } from '../hooks/useJobs';
import { useAuth } from '../context/AuthContext';
import { humanize, formatDateTime } from '../utils/format';
import { useToast } from '../components/shared/Toast';
import { useConfirm } from '../components/shared/Confirm';

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

  const [feedback, setFeedback] = useState('');
  const [rating, setRating] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [linkJobId, setLinkJobId] = useState('');
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const [downloadingResume, setDownloadingResume] = useState(false);
  const [viewingResume, setViewingResume] = useState(false);

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
      toast.success('Interview requested');
    },
    onError: fail('Couldn’t request an interview'),
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

  const uploadResume = useMutation({
    mutationFn: (file: File) => candidateApi.uploadResume(id!, file),
    onSuccess: () => {
      invalidate();
      toast.success('Résumé attached');
    },
    onError: fail('Couldn’t attach that résumé'),
  });

  const deleteResume = useMutation({
    mutationFn: () => candidateApi.deleteResume(id!),
    onSuccess: () => {
      invalidate();
      toast.success('Résumé removed');
    },
    onError: fail('Couldn’t remove the résumé'),
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

  // Opens Outlook Web's "new event" composer prefilled for this interview —
  // frontend-only for now, no Graph API/backend integration. The organizer
  // still has to toggle "Teams meeting" on in Outlook before sending; there's
  // no public deeplink param to force that on.
  const scheduleTeamsMeeting = (jobTitle: string) => {
    if (!candidate) return;
    const params = new URLSearchParams({
      path: '/calendar/action/compose',
      rru: 'addevent',
      subject: `Interview: ${fullName} — ${jobTitle}`,
      body: `Interview with ${fullName} for the ${jobTitle} role. Toggle "Teams meeting" on above before sending the invite.`,
    });
    if (candidate.email) params.set('to', candidate.email);
    window.open(`https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`, '_blank', 'noopener');
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
  const linkedJobIds = new Set(candidate.jobLinks.map((l) => l.jobId));
  const availableJobs = (jobs || []).filter((j) => !linkedJobIds.has(j._id));

  return (
    <AppLayout
      title={fullName}
      subtitle={candidate.currentTitle || 'Candidate'}
      backTo="/candidates"
      backLabel="Back to candidates"
    >
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main profile */}
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-lg border border-border bg-card p-5 shadow-xs">
            <div className="flex items-start gap-4">
              <Avatar name={candidate.firstName} size="lg" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-foreground">{fullName}</h2>
                  {candidate.source === 'LINKEDIN' && (
                    <Badge tone="info">
                      <Icon name="linkedin" size={11} /> Sourced
                    </Badge>
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

            {(candidate.linkedinUrl || candidate.website || candidate.resumeUrl || canAct) && (
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
                {candidate.resumeUrl ? (
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
                    {canAct && (
                      <>
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
                      </>
                    )}
                  </>
                ) : (
                  canAct && (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="upload"
                      onClick={() => resumeInputRef.current?.click()}
                      loading={uploadResume.isPending}
                    >
                      Attach résumé
                    </Button>
                  )
                )}
                {canAct && (
                  <input
                    ref={resumeInputRef}
                    type="file"
                    accept={RESUME_ACCEPT}
                    className="hidden"
                    onChange={handleResumeFile}
                  />
                )}
              </div>
            )}
          </div>

          {/* Feedback */}
          <div className="rounded-lg border border-border bg-card p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                Feedback
                {feedbackList.length > 0 && (
                  <span className="rounded-full bg-muted px-1.5 text-2xs font-medium text-muted-foreground ring-1 ring-inset ring-border">
                    {feedbackList.length}
                  </span>
                )}
              </h3>
              {canAct && !showFeedback && (
                <Button variant="ghost" size="sm" icon="plus" onClick={() => setShowFeedback(true)}>
                  Add feedback
                </Button>
              )}
            </div>

            {canAct && showFeedback && (
              <div className="mt-4 space-y-3 rounded-md border border-border bg-background p-3">
                <Textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Share your assessment of this candidate…"
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
                {submitFeedback.isError && (
                  <p className="text-xs text-brand-text">Couldn’t submit feedback. Please try again.</p>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => submitFeedback.mutate()}
                    disabled={!feedback.trim()}
                    loading={submitFeedback.isPending}
                  >
                    {submitFeedback.isPending ? 'Submitting…' : 'Submit feedback'}
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
                      {f.rating ? <Stars value={f.rating} /> : null}
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
                    ? 'No feedback yet — add the first note.'
                    : 'No feedback has been shared for this candidate yet.'}
                </p>
              )
            )}
          </div>
        </div>

        {/* Linked positions */}
        <div className="space-y-6">
          <div>
            <SectionTitle count={candidate.jobLinks.length}>Linked roles</SectionTitle>

            {candidate.jobLinks.length === 0 ? (
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
                      {canAct && (
                        <div className="mt-3 grid grid-cols-3 gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => shortlist.mutate(link.jobId)}
                            disabled={isPending || link.stage === 'SHORTLISTED'}
                          >
                            Shortlist
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => requestInterview.mutate(link.jobId)}
                            disabled={isPending || link.stage === 'INTERVIEW'}
                          >
                            Interview
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => confirmReject(link.jobId, link.jobTitle)}
                            disabled={isPending || link.stage === 'REJECTED'}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                      {canAct && link.stage === 'INTERVIEW' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon="calendar"
                          className="mt-1.5 w-full"
                          onClick={() => scheduleTeamsMeeting(link.jobTitle)}
                        >
                          Schedule Teams meeting
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {canAct && availableJobs.length > 0 && (
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
      </div>
    </AppLayout>
  );
}
