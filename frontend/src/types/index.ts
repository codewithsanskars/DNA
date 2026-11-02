export type UserRole = 'ADMIN' | 'CLIENT';

export type CandidateStage =
  | 'APPLIED'
  | 'SCREENING'
  | 'SUBMITTED'
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
  avatarUrl?: string | null;
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
  /** The SWFS recruiter on the role — clients see this as their point of contact. */
  owner?: UserRef | null;
  createdAt?: string;
  /** AI analysis of the role (see backend match.service). */
  aiSummary?: string;
  aiRequirements?: JobRequirements;
  aiAnalyzedAt?: string;
}

export interface JobLink {
  applicationId?: string;
  appliedAt?: string;
  stageUpdatedAt?: string;
  rejectionReason?: RejectionReason;
  rejectionNote?: string;
  /** Set when SWFS submitted the candidate to the client for this role. */
  submittedAt?: string;
  submittedByEmail?: string;
  submissionNote?: string;
  /** First time a client user opened the candidate after submission. */
  clientViewedAt?: string;
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
  currentlyWorking?: boolean;
  currentTitle?: string;
  currentCompany?: string;
  location?: string;
  jobLinks: JobLink[];
  skills: string[];
  resumeUrl?: string;
  resumeFileName?: string;
  photoUrl?: string;
  photoFileName?: string;
  linkedinUrl?: string;
  website?: string;
  notes?: string;
  clientRating?: number;
  /** Days of notice the candidate must give their current employer. */
  noticePeriod?: number;
  feedback?: CandidateFeedback[];
  source?: CandidateSource;
  globalStatus: GlobalStatus;
  status: CandidateStatus;
  syncedAt: string;
  createdAt?: string;

  // ---- Extended profile -----------------------------------------------------
  yearsExperience?: number;
  education?: EducationEntry[];
  certifications?: CertificationEntry[];
  employmentHistory?: EmploymentEntry[];
  languages?: string[];
  availableFrom?: string;
  workAuthorization?: WorkAuthorization;
  // SWFS-internal — absent (not just hidden) for CLIENT callers.
  currentCtc?: number;
  expectedCtc?: number;
  ctcCurrency?: string;
  tags?: string[];
  owner?: UserRef | null;
  lastContactedAt?: string;
  /** Present only on talent-search results ranked against a role's JD. */
  match?: MatchBreakdown;
}

export interface UserRef {
  id: string;
  name: string;
  email: string;
}

export interface StaffUser extends UserRef {
  avatarUrl?: string;
}

export interface EducationEntry {
  institution: string;
  degree?: string;
  field?: string;
  startYear?: number;
  endYear?: number;
}

export interface CertificationEntry {
  name: string;
  issuer?: string;
  issuedAt?: string;
  expiresAt?: string;
}

export interface EmploymentEntry {
  company: string;
  title?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
}

export type CandidateSource = 'PORTAL' | 'LINKEDIN' | 'REFERRAL' | 'JOB_BOARD' | 'WEBSITE' | 'AGENCY' | 'IMPORT' | 'OTHER';

export type WorkAuthorization =
  | 'CITIZEN'
  | 'PERMANENT_RESIDENT'
  | 'H1B'
  | 'OPT'
  | 'CPT'
  | 'TN'
  | 'L1'
  | 'EAD'
  | 'NEEDS_SPONSORSHIP'
  | 'OTHER';

export type RejectionReason =
  | 'SKILLS_MISMATCH'
  | 'EXPERIENCE_LEVEL'
  | 'COMPENSATION'
  | 'LOCATION'
  | 'CULTURE_FIT'
  | 'POSITION_FILLED'
  | 'CANDIDATE_WITHDREW'
  | 'OFFER_DECLINED'
  | 'NO_RESPONSE'
  | 'OTHER';

export interface DuplicateMatch {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  currentTitle?: string;
  currentCompany?: string;
  globalStatus?: GlobalStatus;
  matchedOn: ('email' | 'phone' | 'linkedin' | 'name')[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CandidatePage extends Paged<Candidate> {
  /** Totals per global status for the same filters — for tab badges. */
  counts: Record<GlobalStatus, number>;
}

/** GET /dashboard/insights — chart + KPI data, scoped to the caller. */
export interface DashboardInsights {
  generatedAt: string;
  kpis: {
    openRoles: number;
    highPriorityRoles: number;
    onHoldRoles: number;
    activePipeline: number;
    awaitingReview: number;
    inInterview: number;
    interviewsNext7d: number;
    offersOut: number;
    offerAcceptance: number | null;
    hired: number;
    rejected: number;
    activePlacements: number;
    avgTimeToHireDays: number | null;
    medianTimeToHireDays: number | null;
    hiresLast180d: number;
    avgBillRate: number | null;
    totalBillRate: number | null;
    monthlyBilling: number;
    /** Admin only. */
    totalPayRate?: number | null;
    grossMarginPerHour?: number | null;
    monthlyMargin?: number;
    marginPct?: number | null;
  };
  funnel: { stage: CandidateStage; reached: number; current: number; conversion: number | null }[];
  rejected: number;
  trend: { week: string; added: number; submitted: number; hired: number }[];
  timeInStage: { stage: CandidateStage; medianDays: number | null; count: number }[];
  sources: { source: string; count: number; hired: number }[];
  rejectionReasons: { reason: string; count: number }[];
  offerOutcomes: Record<string, number>;
  /** Admin: per client. Client: per open role. */
  groups: {
    id: string;
    label: string;
    openRoles?: number;
    pipeline: number;
    submitted: number;
    hires: number;
    monthlyBilling?: number;
    monthlyMargin?: number;
    daysOpen?: number;
  }[];
}

export interface ClientHomeCandidate {
  applicationId: string;
  candidateId: string;
  name: string;
  currentTitle?: string;
  currentCompany?: string;
  location?: string;
  yearsExperience?: number;
  noticePeriod?: number;
  availableFrom?: string;
  skills: string[];
  photoUrl?: string;
  syncedAt: string;
  jobId: string;
  jobTitle: string;
  submittedAt?: string;
  submissionNote?: string;
  clientViewedAt?: string;
}

export interface ClientHomeRole {
  id: string;
  title: string;
  department?: string;
  location?: string;
  status: JobStatus;
  priority: JobPriority;
  openedAt: string;
  owner: UserRef | null;
  stageCounts: Record<CandidateStage, number>;
}

export interface ClientHome {
  awaitingReview: ClientHomeCandidate[];
  upcomingInterviews: Interview[];
  openOffers: Offer[];
  roles: ClientHomeRole[];
  activePlacements: Placement[];
}

// ---- Recruiter workflow (SWFS staff only) -----------------------------------

export type RecordType = 'candidate' | 'job' | 'organization';
export type NoteKind = 'NOTE' | 'CALL' | 'EMAIL' | 'MEETING' | 'FOLLOW_UP';

export interface RecordNote {
  id: string;
  recordType: RecordType;
  recordId: string;
  kind: NoteKind;
  body: string;
  occurredAt: string;
  author: { id: string | null; name: string; email: string };
  mentions: string[];
  createdAt: string;
  recordLabel?: string | null;
}

export type TaskStatus = 'OPEN' | 'DONE';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';
export type TaskRecurrence = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface Task {
  id: string;
  title: string;
  description?: string;
  dueAt?: string;
  priority: TaskPriority;
  status: TaskStatus;
  recurrence: TaskRecurrence;
  assignee: UserRef | null;
  createdBy: UserRef | null;
  recordType?: RecordType;
  recordId?: string;
  recordLabel?: string | null;
  completedAt?: string;
  createdAt: string;
}

export interface TaskSummary {
  overdue: number;
  dueToday: number;
  open: number;
  recentMentions: RecordNote[];
}

export interface SavedSearch {
  id: string;
  name: string;
  params: Record<string, string>;
  createdAt: string;
}

// ---- Interviews / offers / placements -----------------------------------------

interface ApplicationContext {
  id: string;
  applicationId: string;
  candidateId: string;
  candidateName: string;
  jobId: string;
  jobTitle: string;
  organizationId: string | null;
  organizationName: string | null;
  createdByEmail: string;
  createdAt: string;
}

export type InterviewMode = 'VIDEO' | 'PHONE' | 'ONSITE';
export type InterviewStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export interface Interview extends ApplicationContext {
  round: number;
  scheduledAt: string;
  durationMinutes: number;
  mode: InterviewMode;
  location?: string;
  interviewers?: string;
  status: InterviewStatus;
  notes?: string;
}

export type OfferStatus = 'EXTENDED' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN';
export type OfferRateType = 'ANNUAL' | 'HOURLY';

export interface Offer extends ApplicationContext {
  amount: number;
  currency: string;
  rateType: OfferRateType;
  startDate?: string;
  expiresAt?: string;
  status: OfferStatus;
  notes?: string;
  respondedAt?: string;
}

export type PlacementStatus = 'ACTIVE' | 'COMPLETED' | 'TERMINATED';

export interface Placement extends ApplicationContext {
  startDate: string;
  endDate?: string;
  billRate: number | null;
  /** SWFS-internal — only present for ADMIN callers. */
  payRate?: number | null;
  fee: number | null;
  guaranteeDays: number | null;
  status: PlacementStatus;
  notes?: string;
}

/** In-app notification for the signed-in user. */
export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  actorName?: string;
  readAt?: string;
  createdAt: string;
}

export type ScorecardRecommendation = 'STRONG_NO' | 'NO' | 'YES' | 'STRONG_YES';

export interface ScorecardRating {
  key: string;
  label: string;
  /** 1–5, or null when the interviewer couldn't assess it. */
  score: number | null;
  comment?: string;
}

export interface Scorecard extends ApplicationContext {
  round: number;
  authorEmail: string;
  authorName: string;
  authorRole?: UserRole;
  ratings: ScorecardRating[];
  recommendation: ScorecardRecommendation;
  summary?: string;
  /** Mean of scored criteria, 1–5. */
  overall: number | null;
  updatedAt: string;
}

export interface ScorecardTemplate {
  criteria: { key: string; label: string; description: string }[];
  scale: { min: number; max: number };
}

export interface CandidateRecords {
  interviews: Interview[];
  offers: Offer[];
  placements: Placement[];
  scorecards: Scorecard[];
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
  id?: string;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  isDecisionMaker?: boolean;
  isHiringManager?: boolean;
  notes?: string;
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

/** Structured requirements the AI extracted from a role's JD. */
export interface JobRequirements {
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  titles: string[];
  minYears?: number;
  location?: string;
  remote?: boolean;
  method: 'ai' | 'keywords';
}

/** Deterministic JD match for one candidate. */
export interface MatchBreakdown {
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  titleMatch: boolean;
  experienceOk: boolean | null;
  locationOk: boolean | null;
}

export interface MatchedSearchPage extends Paged<Candidate> {
  matchJob?: { id: string; title: string; requirements: JobRequirements };
}
