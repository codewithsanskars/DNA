import {
  UserRole,
  CandidateStage,
  CandidateSource,
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

export const JOB_STATUSES: JobStatus[] = ['OPEN', 'CLOSED', 'ON_HOLD'];

export const JOB_PRIORITIES: JobPriority[] = ['LOW', 'MEDIUM', 'HIGH'];

export const WORK_TYPES: WorkType[] = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'CONTRACT_TO_HIRE'];

export const PAYROLL_TYPES: PayrollType[] = ['THIRD_PARTY', 'IN_HOUSE'];
