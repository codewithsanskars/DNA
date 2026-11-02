import {
  UserRole,
  CandidateStage,
  CandidateSource,
  GlobalStatus,
  CandidateStatus,
  JobStatus,
  JobPriority,
  WorkType,
  PayrollType,
  WorkAuthorization,
  RejectionReason,
  NoteKind,
  RecordType,
  TaskStatus,
  TaskPriority,
  TaskRecurrence,
  InterviewMode,
  InterviewStatus,
  OfferStatus,
  OfferRateType,
  PlacementStatus,
} from '../types';

/**
 * Runtime value arrays for the domain unions in `src/types`, used by the
 * `@Column({ type: 'enum', enum: ... })` decorators.
 */
export const USER_ROLES: UserRole[] = ['ADMIN', 'CLIENT'];

export const CANDIDATE_STAGES: CandidateStage[] = [
  'APPLIED',
  'SCREENING',
  'SUBMITTED',
  'INTERVIEW',
  'SHORTLISTED',
  'OFFER',
  'HIRED',
  'REJECTED',
];

export const CANDIDATE_SOURCES: CandidateSource[] = [
  'PORTAL',
  'LINKEDIN',
  'REFERRAL',
  'JOB_BOARD',
  'WEBSITE',
  'AGENCY',
  'IMPORT',
  'OTHER',
];

export const GLOBAL_STATUSES: GlobalStatus[] = ['OPEN', 'SELECTED', 'ONBOARDED', 'ARCHIVED'];

// The candidate's `status` options, scoped to their current `globalStatus`.
// The first entry in each list is the default a candidate falls back to
// when their globalStatus changes without an explicit status being chosen.
export const STATUS_OPTIONS_BY_GLOBAL_STATUS: Record<GlobalStatus, CandidateStatus[]> = {
  OPEN: ['LOOKING'],
  SELECTED: ['SELECTED'],
  ONBOARDED: ['COMPANY', 'SWFS'],
  ARCHIVED: ['BLACKLISTED', 'OPPORTUNITY', 'OFFBOARDED', 'NOT_INTERESTED', 'CONTACTED'],
};

export const CANDIDATE_STATUSES: CandidateStatus[] = Object.values(STATUS_OPTIONS_BY_GLOBAL_STATUS).flat();

export const JOB_STATUSES: JobStatus[] = ['OPEN', 'CLOSED', 'ON_HOLD'];

export const JOB_PRIORITIES: JobPriority[] = ['LOW', 'MEDIUM', 'HIGH'];

export const WORK_TYPES: WorkType[] = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'CONTRACT_TO_HIRE'];

export const PAYROLL_TYPES: PayrollType[] = ['THIRD_PARTY', 'IN_HOUSE'];

export const WORK_AUTHORIZATIONS: WorkAuthorization[] = [
  'CITIZEN',
  'PERMANENT_RESIDENT',
  'H1B',
  'OPT',
  'CPT',
  'TN',
  'L1',
  'EAD',
  'NEEDS_SPONSORSHIP',
  'OTHER',
];

export const REJECTION_REASONS: RejectionReason[] = [
  'SKILLS_MISMATCH',
  'EXPERIENCE_LEVEL',
  'COMPENSATION',
  'LOCATION',
  'CULTURE_FIT',
  'POSITION_FILLED',
  'CANDIDATE_WITHDREW',
  'OFFER_DECLINED',
  'NO_RESPONSE',
  'OTHER',
];

export const NOTE_KINDS: NoteKind[] = ['NOTE', 'CALL', 'EMAIL', 'MEETING', 'FOLLOW_UP'];
export const RECORD_TYPES: RecordType[] = ['candidate', 'job', 'organization'];

export const TASK_STATUSES: TaskStatus[] = ['OPEN', 'DONE'];
export const TASK_PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH'];
export const TASK_RECURRENCES: TaskRecurrence[] = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'];

export const INTERVIEW_MODES: InterviewMode[] = ['VIDEO', 'PHONE', 'ONSITE'];
export const INTERVIEW_STATUSES: InterviewStatus[] = ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

export const OFFER_STATUSES: OfferStatus[] = ['EXTENDED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN'];
export const OFFER_RATE_TYPES: OfferRateType[] = ['ANNUAL', 'HOURLY'];

export const PLACEMENT_STATUSES: PlacementStatus[] = ['ACTIVE', 'COMPLETED', 'TERMINATED'];

export type ScorecardRecommendation = 'STRONG_NO' | 'NO' | 'YES' | 'STRONG_YES';
export const SCORECARD_RECOMMENDATIONS: ScorecardRecommendation[] = ['STRONG_NO', 'NO', 'YES', 'STRONG_YES'];

/**
 * The generic scorecard every interview round uses. Keys are stable (stored
 * on each scorecard); labels/descriptions can be reworded freely. When
 * per-role templates arrive (F-1), this becomes the default template.
 */
export const SCORECARD_CRITERIA: { key: string; label: string; description: string }[] = [
  { key: 'technical', label: 'Technical / functional skills', description: 'Depth in the skills the role actually needs.' },
  { key: 'problem_solving', label: 'Problem solving', description: 'Structures ambiguous problems and reasons to a good answer.' },
  { key: 'communication', label: 'Communication', description: 'Clear, concise, listens, adapts to the audience.' },
  { key: 'experience', label: 'Relevant experience', description: 'Has done comparable work at comparable scope.' },
  { key: 'collaboration', label: 'Collaboration & team fit', description: 'Works well with others; fits how the team operates.' },
  { key: 'motivation', label: 'Motivation & interest', description: 'Genuinely wants this role; aligned on expectations.' },
];
