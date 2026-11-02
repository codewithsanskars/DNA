import {
  CandidateSource,
  InterviewMode,
  NoteKind,
  OfferStatus,
  PlacementStatus,
  RejectionReason,
  TaskPriority,
  TaskRecurrence,
  WorkAuthorization,
} from '../types';
import { IconName } from '../components/shared/Icon';

/** Display labels for backend enums — keep option lists and labels in one place. */

export const SOURCE_LABELS: Record<CandidateSource, string> = {
  PORTAL: 'Portal',
  LINKEDIN: 'LinkedIn',
  REFERRAL: 'Referral',
  JOB_BOARD: 'Job board',
  WEBSITE: 'Website',
  AGENCY: 'Agency',
  IMPORT: 'Import',
  OTHER: 'Other',
};

export const WORK_AUTH_LABELS: Record<WorkAuthorization, string> = {
  CITIZEN: 'Citizen',
  PERMANENT_RESIDENT: 'Permanent resident / Green card',
  H1B: 'H-1B',
  OPT: 'OPT',
  CPT: 'CPT',
  TN: 'TN',
  L1: 'L-1',
  EAD: 'EAD',
  NEEDS_SPONSORSHIP: 'Needs sponsorship',
  OTHER: 'Other',
};

export const REJECTION_LABELS: Record<RejectionReason, string> = {
  SKILLS_MISMATCH: 'Skills mismatch',
  EXPERIENCE_LEVEL: 'Experience level',
  COMPENSATION: 'Compensation',
  LOCATION: 'Location',
  CULTURE_FIT: 'Culture fit',
  POSITION_FILLED: 'Position filled',
  CANDIDATE_WITHDREW: 'Candidate withdrew',
  OFFER_DECLINED: 'Offer declined',
  NO_RESPONSE: 'No response',
  OTHER: 'Other',
};

export const NOTE_KIND_META: Record<NoteKind, { label: string; verb: string; icon: IconName }> = {
  NOTE: { label: 'Note', verb: 'added a note', icon: 'message' },
  CALL: { label: 'Call', verb: 'logged a call', icon: 'phone' },
  EMAIL: { label: 'Email', verb: 'logged an email', icon: 'mail' },
  MEETING: { label: 'Meeting', verb: 'logged a meeting', icon: 'users' },
  FOLLOW_UP: { label: 'Follow-up', verb: 'logged a follow-up', icon: 'repeat' },
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };

export const RECURRENCE_LABELS: Record<TaskRecurrence, string> = {
  NONE: 'Does not repeat',
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
};

export const INTERVIEW_MODE_LABELS: Record<InterviewMode, string> = { VIDEO: 'Video', PHONE: 'Phone', ONSITE: 'On-site' };

export const OFFER_STATUS_TONE: Record<OfferStatus, 'info' | 'success' | 'danger' | 'neutral'> = {
  EXTENDED: 'info',
  ACCEPTED: 'success',
  DECLINED: 'danger',
  WITHDRAWN: 'neutral',
};

export const PLACEMENT_STATUS_TONE: Record<PlacementStatus, 'success' | 'neutral' | 'danger'> = {
  ACTIVE: 'success',
  COMPLETED: 'neutral',
  TERMINATED: 'danger',
};

export function formatMoney(value?: number | null, currency = 'USD'): string {
  if (value == null) return '—';
  try {
    return value.toLocaleString('en-US', { style: 'currency', currency, maximumFractionDigits: 0 });
  } catch {
    return `${currency} ${value.toLocaleString('en-US')}`;
  }
}

/** `2026-10-09` -> `Oct 9, 2026` without timezone drift for date-only values. */
export function formatDay(value?: string | null): string {
  if (!value) return '—';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Days from today to a date (negative = past). */
export function daysUntil(value: string): number {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

/** Relative due-date phrase for tasks: "Overdue 2d", "Today", "Tomorrow", "In 5d". */
export function dueLabel(iso?: string): { text: string; tone: 'danger' | 'warning' | 'neutral' } | null {
  if (!iso) return null;
  const due = new Date(iso);
  const now = new Date();
  if (due.getTime() < now.getTime()) {
    const days = Math.floor((now.getTime() - due.getTime()) / 86_400_000);
    return { text: days ? `Overdue ${days}d` : 'Overdue', tone: 'danger' };
  }
  const d = daysUntil(iso);
  if (d === 0) return { text: `Today ${due.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`, tone: 'warning' };
  if (d === 1) return { text: 'Tomorrow', tone: 'neutral' };
  return { text: due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), tone: 'neutral' };
}
