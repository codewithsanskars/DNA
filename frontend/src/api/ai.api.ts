import api from './axios';
import { ApiResponse, CertificationEntry, EducationEntry, EmploymentEntry, JobPriority, JobRequirements } from '../types';

export interface AiStatus {
  provider: 'openai' | 'ollama';
  model: string;
  available: boolean;
  detail?: string;
}

export interface ParsedResume {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;
  website?: string;
  currentTitle?: string;
  currentCompany?: string;
  currentlyWorking?: boolean;
  yearsExperience?: number;
  skills: string[];
  languages: string[];
  employmentHistory: EmploymentEntry[];
  education: EducationEntry[];
  certifications: CertificationEntry[];
  summary?: string;
}

export interface MatchResult {
  score: number;
  verdict: 'STRONG' | 'GOOD' | 'PARTIAL' | 'WEAK';
  summary: string;
  strengths: string[];
  gaps: string[];
  interviewQuestions: string[];
}

export interface RankedCandidate {
  candidateId: string;
  name: string;
  currentTitle?: string;
  currentCompany?: string;
  location?: string;
  score: number;
  reason: string;
}

export interface CandidateBrief {
  headline: string;
  summary: string;
  highlights: string[];
  considerations: string[];
}

export interface AiSearchResult {
  filters: Record<string, string | number | string[]>;
  explanation: string;
}

export interface JobInsights {
  jobId: string;
  summary: string | null;
  requirements: JobRequirements | null;
  analyzedAt: string | null;
  /** SWFS only — clients never get pool counts. */
  matchCount?: number;
  strongCount?: number;
  poolSize?: number;
  threshold?: number;
}

export interface NewOpening {
  id: string;
  title: string;
  organizationName?: string;
  location?: string;
  priority: JobPriority;
  openedAt: string;
  totalCandidates: number;
  summary: string | null;
  mustHaveSkills: string[];
  matchCount: number | null;
  strongCount: number | null;
}

const data = <T,>(p: Promise<{ data: ApiResponse<T> }>) => p.then((r) => r.data.data as T);
// LLM calls (especially local Ollama) can take a while.
const slow = { timeout: 180000 };

export const aiApi = {
  status: () => data<AiStatus>(api.get('/ai/status')),
  parseResumeFile: (file: File) => {
    const fd = new FormData();
    fd.append('resume', file);
    return data<ParsedResume>(api.post('/ai/parse-resume', fd, slow));
  },
  parseResumeText: (text: string) => data<ParsedResume>(api.post('/ai/parse-resume/text', { text }, slow)),
  parseCandidateResume: (candidateId: string) =>
    data<ParsedResume>(api.post(`/ai/candidates/${candidateId}/parse-resume`, {}, slow)),
  match: (candidateId: string, jobId: string) => data<MatchResult>(api.post('/ai/match', { candidateId, jobId }, slow)),
  rankPool: (jobId: string, limit = 10) =>
    data<{ jobId: string; results: RankedCandidate[] }>(api.post(`/ai/jobs/${jobId}/rank`, { limit }, slow)),
  summarize: (candidateId: string, jobId?: string) =>
    data<CandidateBrief>(api.post(`/ai/candidates/${candidateId}/summary`, { jobId }, slow)),
  submissionNote: (candidateId: string, jobId: string) =>
    data<{ note: string }>(api.post(`/ai/candidates/${candidateId}/submission-note`, { jobId }, slow)),
  jobDescription: (input: {
    title: string;
    brief?: string;
    department?: string;
    location?: string;
    workType?: string;
    existing?: string;
  }) => data<{ description: string }>(api.post('/ai/job-description', input, slow)),
  jobInsights: (jobId: string) => data<JobInsights>(api.get(`/ai/jobs/${jobId}/insights`, slow)),
  analyzeJob: (jobId: string) =>
    data<Pick<JobInsights, 'summary' | 'requirements' | 'analyzedAt'>>(api.post(`/ai/jobs/${jobId}/analyze`, {}, slow)),
  newOpenings: (days = 14) => data<NewOpening[]>(api.get('/ai/new-openings', { params: { days }, ...slow })),
  search: (query: string) => data<AiSearchResult>(api.post('/ai/search', { query }, slow)),
};
