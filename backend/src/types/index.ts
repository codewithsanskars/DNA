import { Request } from 'express';

export type UserRole = 'ADMIN' | 'CLIENT';

export type CandidateStage =
  | 'APPLIED'
  | 'SCREENING'
  | 'INTERVIEW'
  | 'SHORTLISTED'
  | 'OFFER'
  | 'HIRED'
  | 'REJECTED';

export type CandidateSource = 'PORTAL' | 'LINKEDIN';

export type GlobalStatus = 'OPEN' | 'SELECTED' | 'ONBOARDED' | 'ARCHIVED';

// The valid `status` values for a candidate depend on their `globalStatus` —
// each group below is only ever paired with its own globalStatus.
export type OpenCandidateStatus = 'LOOKING';
export type SelectedCandidateStatus = 'SELECTED' | 'NEGOTIATIONS' | 'OFFER_LETTER' | 'ACCEPTED';
export type OnboardedCandidateStatus = 'COMPANY' | 'SWFS';
export type ArchivedCandidateStatus =
  | 'BLACKLISTED'
  | 'OPPORTUNITY'
  | 'OFFBOARDED'
  | 'NOT_INTERESTED'
  | 'CONTACTED';

export type CandidateStatus =
  | OpenCandidateStatus
  | SelectedCandidateStatus
  | OnboardedCandidateStatus
  | ArchivedCandidateStatus;

export type JobStatus = 'OPEN' | 'CLOSED' | 'ON_HOLD';

export type JobPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export type WorkType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'CONTRACT_TO_HIRE';

export type PayrollType = 'THIRD_PARTY' | 'IN_HOUSE';

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  organizationId: string;
  organizationName: string;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}
