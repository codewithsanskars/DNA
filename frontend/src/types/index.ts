export type UserRole = 'SWFS_ADMIN' | 'SWFS_RECRUITER' | 'CLIENT_ADMIN' | 'HIRING_MANAGER' | 'VIEWER';

export type CandidateStage =
  | 'APPLIED'
  | 'SCREENING'
  | 'INTERVIEW'
  | 'SHORTLISTED'
  | 'OFFER'
  | 'HIRED'
  | 'REJECTED';

export type JobStatus = 'OPEN' | 'CLOSED' | 'ON_HOLD';

export type WorkType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'CONTRACT_TO_HIRE';

export type PayrollType = 'THIRD_PARTY' | 'IN_HOUSE';

export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string;
  organizationName: string;
}

export interface Job {
  _id: string;
  recruitCrmId: string;
  organizationId: string;
  title: string;
  department?: string;
  location?: string;
  status: JobStatus;
  totalCandidates: number;
  openedAt?: string;
  syncedAt: string;
  description?: string;
  payRate?: string;
  billableHours?: string;
  workType?: WorkType;
  payrollType?: PayrollType;
}

export interface Candidate {
  _id: string;
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
  syncedAt: string;
}

export interface DashboardSummary {
  openJobs: number;
  totalJobs: number;
  totalCandidates: number;
  shortlisted: number;
  inInterview: number;
  selected: number;
  pipelineSummary: Record<CandidateStage, number>;
  recentActivity: AuditLog[];
}

export interface AuditLog {
  _id: string;
  userId: string;
  userEmail: string;
  organizationId: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface Organization {
  _id: string;
  name: string;
  slug: string;
  industry?: string;
  website?: string;
  attio?: {
    email?: string;
    socialLinks?: {
      linkedin?: string;
      twitter?: string;
      facebook?: string;
    };
    employeeCount?: number;
    founded?: string;
    hq?: string;
    description?: string;
    contacts?: { name: string; title: string; email: string }[];
    recentActivity?: { type: string; content: string; date: string }[];
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
