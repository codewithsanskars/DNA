export type UserRole = 'ADMIN' | 'CLIENT';

export type CandidateStage =
  | 'APPLIED'
  | 'SCREENING'
  | 'INTERVIEW'
  | 'SHORTLISTED'
  | 'OFFER'
  | 'HIRED'
  | 'REJECTED';

export type GlobalStatus = 'OPEN' | 'SELECTED' | 'ONBOARDED' | 'ARCHIVED';

// Valid `status` values depend on the candidate's globalStatus — see
// STATUS_OPTIONS_BY_GLOBAL_STATUS in utils/candidateStatus.ts.
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
  organizationId: string;
  title: string;
  department?: string;
  location?: string;
  status: JobStatus;
  priority: JobPriority;
  totalCandidates: number;
  openedAt?: string;
  syncedAt: string;
  description?: string;
  // Cost paid to the candidate — SWFS-internal. Only ever present in the API
  // response for an ADMIN caller; absent (not just hidden) for a CLIENT one.
  payRate?: number;
  // Rate charged to the client — the one rate a client is allowed to see.
  billRate?: number;
  // billRate - payRate. Only ever present for an ADMIN caller.
  grossMargin?: number;
  billableHours?: string;
  workType?: WorkType;
  payrollType?: PayrollType;
  jdUrl?: string;
  jdFileName?: string;
}

export interface JobLink {
  jobId: string;
  jobTitle: string;
  stage: CandidateStage;
  organizationId?: string;
  organizationName?: string;
  interviewRound: number;
  interviewFeedback: InterviewRoundFeedback[];
}

export interface CandidateFeedback {
  id: string;
  author: string;
  authorRole?: string;
  comment: string;
  rating?: number;
  createdAt: string;
}

export interface InterviewRoundFeedback {
  id: string;
  round: number;
  author: string;
  authorRole?: string;
  comment: string;
  rating?: number;
  createdAt: string;
}

export interface Candidate {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  currentTitle?: string;
  currentCompany?: string;
  location?: string;
  jobLinks: JobLink[];
  skills: string[];
  resumeUrl?: string;
  resumeFileName?: string;
  linkedinUrl?: string;
  website?: string;
  notes?: string;
  clientRating?: number;
  feedback?: CandidateFeedback[];
  source?: 'PORTAL' | 'LINKEDIN';
  globalStatus: GlobalStatus;
  status: CandidateStatus;
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

export interface OrganizationContact {
  name: string;
  title: string;
  email: string;
}

export interface OrganizationSocialLinks {
  linkedin?: string;
  twitter?: string;
  facebook?: string;
  instagram?: string;
  [platform: string]: string | undefined;
}

export interface Organization {
  _id: string;
  name: string;
  slug: string;
  industry?: string;
  website?: string;
  logoUrl?: string;
  email?: string;
  description?: string;
  hq?: string;
  employeeCount?: number;
  founded?: string;
  socialLinks?: OrganizationSocialLinks;
  contacts?: OrganizationContact[];
}

/** Preview returned by scraping a company's page — nothing is saved until the form is submitted. */
export interface ScrapedOrganization {
  name?: string;
  description?: string;
  website?: string;
  logoUrl?: string;
  email?: string;
  hq?: string;
  employeeCount?: number;
  founded?: string;
  socialLinks?: OrganizationSocialLinks;
  sourceUrl: string;
}

export interface CreateOrganizationInput {
  name: string;
  industry?: string;
  website?: string;
  logoUrl?: string;
  email?: string;
  description?: string;
  hq?: string;
  employeeCount?: number;
  founded?: string;
  socialLinks?: OrganizationSocialLinks;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
