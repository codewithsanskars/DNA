import { CandidateStage, JobStatus } from '../../types';

const STAGE_STYLES: Record<CandidateStage, string> = {
  APPLIED: 'bg-gray-800 text-gray-300',
  SCREENING: 'bg-yellow-900/40 text-yellow-400',
  INTERVIEW: 'bg-blue-900/40 text-blue-400',
  SHORTLISTED: 'bg-purple-900/40 text-purple-400',
  OFFER: 'bg-orange-900/40 text-orange-400',
  HIRED: 'bg-green-900/40 text-green-400',
  REJECTED: 'bg-red-900/40 text-red-400',
};

const STATUS_STYLES: Record<JobStatus, string> = {
  OPEN: 'bg-green-900/40 text-green-400',
  CLOSED: 'bg-gray-800 text-gray-400',
  ON_HOLD: 'bg-yellow-900/40 text-yellow-400',
};

export function StageBadge({ stage }: { stage: CandidateStage }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${STAGE_STYLES[stage]}`}>
      {stage.replace('_', ' ')}
    </span>
  );
}

export function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  return (
    <span className="inline-flex items-center rounded bg-blue-900/30 px-2 py-0.5 text-xs font-medium text-blue-400">
      {role.replace(/_/g, ' ')}
    </span>
  );
}
