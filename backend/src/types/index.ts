import { Request } from 'express';
import { Document } from 'mongoose';

export type UserRole = 'SWFS_ADMIN' | 'SWFS_RECRUITER' | 'CLIENT_ADMIN' | 'HIRING_MANAGER' | 'VIEWER';

export type CandidateStage =
  | 'APPLIED'
  | 'SCREENING'
  | 'INTERVIEW'
  | 'SHORTLISTED'
  | 'OFFER'
  | 'HIRED'
  | 'REJECTED';

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

export interface IOrganization extends Document {
  name: string;
  slug: string;
  attioId?: string;
  industry?: string;
  website?: string;
  logoUrl?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUser extends Document {
  email: string;
  name: string;
  role: UserRole;
  oktaId?: string;
  avatarUrl?: string;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IOrganizationUser extends Document {
  organizationId: string;
  userId: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
}

export interface IAuditLog extends Document {
  userId: string;
  userEmail: string;
  organizationId: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  createdAt: Date;
}

export interface IJobCache extends Document {
  recruitCrmId: string;
  organizationId: string;
  title: string;
  department?: string;
  location?: string;
  status: 'OPEN' | 'CLOSED' | 'ON_HOLD';
  totalCandidates: number;
  openedAt?: Date;
  syncedAt: Date;
  description?: string;
  payRate?: string;
  billableHours?: string;
  workType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'CONTRACT_TO_HIRE';
  payrollType?: 'THIRD_PARTY' | 'IN_HOUSE';
  rawData: Record<string, unknown>;
}

export interface ICandidateCache extends Document {
  recruitCrmId: string;
  organizationId: string;
  jobId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  currentTitle?: string;
  currentCompany?: string;
  location?: string;
  stage: CandidateStage;
  skills: string[];
  resumeUrl?: string;
  linkedinUrl?: string;
  notes?: string;
  clientRating?: number;
  syncedAt: Date;
  rawData: Record<string, unknown>;
}
