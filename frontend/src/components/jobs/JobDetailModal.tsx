import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import Modal from '../shared/Modal';
import Button from '../shared/Button';
import { CenteredSpinner } from '../shared/LoadingSpinner';
import { EmptyState } from '../shared/States';
import { StatusBadge, StageBadge, PriorityBadge } from '../shared/Badge';
import Avatar from '../shared/Avatar';
import DetailRow from '../shared/DetailRow';
import Icon from '../shared/Icon';
import { useToast } from '../shared/Toast';
import { useConfirm } from '../shared/Confirm';
import { jobApi } from '../../api/job.api';
import { queryKeys } from '../../api/queryKeys';
import { useOrganizations } from '../../hooks/useOrganizations';
import { useAuth } from '../../context/AuthContext';
import { isAdminRole } from '../../utils/roles';
import { formatDate, formatRate } from '../../utils/format';
import { errorMessage } from '../../utils/errors';
import { Job, WorkType, PayrollType } from '../../types';

export const JD_ACCEPT =
  '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const WORK_TYPE_LABELS: Record<WorkType, string> = {
  FULL_TIME: 'Full-Time',
  PART_TIME: 'Part-Time',
  CONTRACT: 'Contract',
  CONTRACT_TO_HIRE: 'Contract-to-Hire',
};

const PAYROLL_LABELS: Record<PayrollType, string> = {
  THIRD_PARTY: 'SWFS Payroll',
  IN_HOUSE: "Own Payroll",
};

type Tab = 'details' | 'candidates';

const detailOrDash = (value?: string | null) => value || '—';

interface JobDetailModalProps {
  job: Job;
  onClose: () => void;
  onEdit?: (job: Job) => void;
}

export default function JobDetailModal({ job, onClose, onEdit }: JobDetailModalProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);
  const isClient = !isAdmin;
  const [tab, setTab] = useState<Tab>('details');
  const jdInputRef = useRef<HTMLInputElement>(null);
  const [downloadingJd, setDownloadingJd] = useState(false);

  const { organizations: clients } = useOrganizations({ enabled: isAdmin });
  const clientName = clients?.find((c) => c._id === job.organizationId)?.name;

  const { data: candidates, isLoading } = useQuery({
    queryKey: queryKeys.jobPipeline(job._id),
    queryFn: () => jobApi.getJobPipeline(job._id),
    enabled: tab === 'candidates',
  });

  const invalidateJob = () => queryClient.invalidateQueries({ queryKey: queryKeys.jobs });

  const uploadJd = useMutation({
    mutationFn: (file: File) => jobApi.uploadJobDescription(job._id, file),
    onSuccess: () => {
      invalidateJob();
      toast.success('Job description attached');
    },
    onError: (err) => toast.error('Couldn’t attach that job description', errorMessage(err, 'Please try again.')),
  });

  const deleteJd = useMutation({
    mutationFn: () => jobApi.deleteJobDescription(job._id),
    onSuccess: () => {
      invalidateJob();
      toast.success('Job description removed');
    },
    onError: (err) => toast.error('Couldn’t remove the job description', errorMessage(err, 'Please try again.')),
  });

  const handleJdFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/\.(pdf|docx)$/i.test(file.name)) {
      toast.error('Job description must be a .pdf or .docx file');
      return;
    }
    uploadJd.mutate(file);
  };

  const handleDownloadJd = async () => {
    setDownloadingJd(true);
    try {
      await jobApi.downloadJobDescription(job._id, job.jdFileName);
    } catch {
      toast.error('Couldn’t download job description', 'Please try again.');
    } finally {
      setDownloadingJd(false);
    }
  };

  const confirmDeleteJd = async () => {
    const ok = await confirm({
      title: 'Remove job description?',
      description: `This removes the attached job description from "${job.title}".`,
      confirmLabel: 'Remove file',
      tone: 'danger',
    });
    if (ok) deleteJd.mutate();
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'details', label: 'Job info' },
    { id: 'candidates', label: `Candidates · ${job.totalCandidates}` },
  ];

  return (
    <Modal
      title={job.title}
      description={isAdmin && clientName ? clientName : undefined}
      onClose={onClose}
      size="xl"
      footer={
        <>
          {tab === 'candidates' && job.totalCandidates > 0 && (
            <Button
              variant="ghost"
              size="sm"
              iconRight="arrow-right"
              className="mr-auto"
              onClick={() => navigate(`/jobs/${job._id}`)}
            >
              Open full candidate list
            </Button>
          )}
          {onEdit && (
            <Button variant="secondary" size="sm" icon="edit" onClick={() => onEdit(job)}>
              Edit
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="mb-4 flex gap-4 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-1 pb-2.5 text-[13px] font-medium transition-colors ${
              tab === t.id
                ? 'border-brand text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'details' ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
            <StatusBadge status={job.status} />
            <PriorityBadge priority={job.priority} />
            {job.department && <span>{job.department}</span>}
            {job.location && (
              <span className="inline-flex items-center gap-1">
                <Icon name="pin" size={12} /> {job.location}
              </span>
            )}
          </div>

          {job.description && (
            <div>
              <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-subtle-foreground">
                Description
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">{job.description}</p>
            </div>
          )}

          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-4">
            <DetailRow label="Location">{detailOrDash(job.location)}</DetailRow>
            <DetailRow label="Bill rate">{formatRate(job.billRate)}</DetailRow>
            {isAdmin && <DetailRow label="Pay rate">{formatRate(job.payRate)}</DetailRow>}
            {isAdmin && (
              <DetailRow label="Gross margin">
                <span className={job.grossMargin != null && job.grossMargin < 0 ? 'text-brand-text' : undefined}>
                  {formatRate(job.grossMargin)}
                </span>
              </DetailRow>
            )}
            <DetailRow label="Billable hours">{detailOrDash(job.billableHours)}</DetailRow>
            <DetailRow label="Type of work">
              {detailOrDash(job.workType ? WORK_TYPE_LABELS[job.workType] : undefined)}
            </DetailRow>
            <DetailRow label="Payroll">
              {detailOrDash(job.payrollType ? PAYROLL_LABELS[job.payrollType] : undefined)}
            </DetailRow>
            {job.openedAt && <DetailRow label="Opened">{formatDate(job.openedAt)}</DetailRow>}
          </dl>

          <div className="border-t border-border pt-4">
            <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle-foreground">
              Job description
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {job.jdUrl ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="file"
                    onClick={handleDownloadJd}
                    loading={downloadingJd}
                  >
                    {job.jdFileName || 'Job description'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="download"
                    onClick={handleDownloadJd}
                    loading={downloadingJd}
                  >
                    Download
                  </Button>
                  {isClient && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="upload"
                        onClick={() => jdInputRef.current?.click()}
                        loading={uploadJd.isPending}
                      >
                        Replace
                      </Button>
                      <Button variant="ghost" size="sm" icon="trash" onClick={confirmDeleteJd}>
                        Remove
                      </Button>
                    </>
                  )}
                </>
              ) : isClient ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon="upload"
                  onClick={() => jdInputRef.current?.click()}
                  loading={uploadJd.isPending}
                >
                  Attach job description
                </Button>
              ) : (
                <p className="text-[13px] text-muted-foreground">
                  No job description has been attached for this role yet.
                </p>
              )}
              {isClient && (
                <input
                  ref={jdInputRef}
                  type="file"
                  accept={JD_ACCEPT}
                  className="hidden"
                  onChange={handleJdFile}
                />
              )}
            </div>
          </div>
        </div>
      ) : isLoading ? (
        <div className="py-6">
          <CenteredSpinner />
        </div>
      ) : !candidates || candidates.length === 0 ? (
        <EmptyState icon="users" title="No candidates yet" description="Candidates linked to this role will appear here." />
      ) : (
        <div className="space-y-2">
          {candidates.map((c) => {
            const link = c.jobLinks.find((l) => l.jobId === job._id);
            return (
              <button
                key={c._id}
                type="button"
                onClick={() => navigate(`/candidates/${c._id}`)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={c.firstName} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {c.firstName} {c.lastName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.currentTitle}
                      {c.currentCompany && ` · ${c.currentCompany}`}
                    </p>
                  </div>
                </div>
                {link && <StageBadge stage={link.stage} />}
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
