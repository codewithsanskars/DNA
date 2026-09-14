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

export type JobStatus = 'OPEN' | 'CLOSED' | 'ON_HOLD';

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
