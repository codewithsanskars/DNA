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
} from '../types';

/**
 * Runtime value arrays for the domain unions in `src/types`, used by the
 * `@Column({ type: 'enum', enum: ... })` decorators.
 */
export const USER_ROLES: UserRole[] = ['ADMIN', 'CLIENT'];

export const CANDIDATE_STAGES: CandidateStage[] = [
  'APPLIED',
  'SCREENING',
  'INTERVIEW',
  'SHORTLISTED',
  'OFFER',
  'HIRED',
  'REJECTED',
];

export const CANDIDATE_SOURCES: CandidateSource[] = ['PORTAL', 'LINKEDIN'];

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
