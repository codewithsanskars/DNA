import { ReactNode } from 'react';
import { CandidateStage, JobStatus } from '../../types';
import { humanize } from '../../utils/format';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'info' | 'purple' | 'danger';

const TONES: Record<BadgeTone, string> = {
  neutral:
    'bg-muted text-muted-foreground ring-1 ring-inset ring-border',
  brand:
    'bg-brand-subtle text-brand-text ring-1 ring-inset ring-brand/20',
  success:
    'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-400/20',
  warning:
    'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-400/20',
  info:
    'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-400 dark:ring-sky-400/20',
  purple:
    'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-400 dark:ring-violet-400/20',
  danger:
    'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-400/20',
};

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}

export default function Badge({ tone = 'neutral', children, className = '', dot }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-2xs font-medium ${TONES[tone]} ${className}`}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const STAGE_TONES: Record<CandidateStage, BadgeTone> = {
  APPLIED: 'neutral',
  SCREENING: 'warning',
  INTERVIEW: 'info',
  SHORTLISTED: 'purple',
  OFFER: 'brand',
  HIRED: 'success',
  REJECTED: 'danger',
};

const STATUS_TONES: Record<JobStatus, BadgeTone> = {
  OPEN: 'success',
  CLOSED: 'neutral',
  ON_HOLD: 'warning',
};

export function StageBadge({ stage }: { stage: CandidateStage }) {
  return (
    <Badge tone={STAGE_TONES[stage]} dot>
      {humanize(stage)}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <Badge tone={STATUS_TONES[status]} dot>
      {humanize(status)}
    </Badge>
  );
}

export function RoleBadge({ role }: { role: string }) {
  if (!role) return null;
  return <Badge tone="neutral">{humanize(role)}</Badge>;
}
