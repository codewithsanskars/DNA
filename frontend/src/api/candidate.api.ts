import api from './axios';
import {
  ApiResponse,
  Candidate,
  CandidatePage,
  CandidateSource,
  CandidateStage,
  CandidateStatus,
  CertificationEntry,
  DuplicateMatch,
  EducationEntry,
  EmploymentEntry,
  GlobalStatus,
  MatchedSearchPage,
  Paged,
  RejectionReason,
  WorkAuthorization,
} from '../types';

/** Extended profile fields accepted by create / update / import. */
export interface CandidateProfileInput {
  yearsExperience?: number | null;
  education?: EducationEntry[];
  certifications?: CertificationEntry[];
  employmentHistory?: EmploymentEntry[];
  languages?: string[];
  currentCtc?: number | null;
  expectedCtc?: number | null;
  ctcCurrency?: string;
  availableFrom?: string | null;
  workAuthorization?: WorkAuthorization | null;
  tags?: string[];
  ownerId?: string | null;
}

export type CandidateSearchParams = Record<string, string | number | undefined>;

export type BulkAction =
  | { action: 'addTags' | 'removeTags'; tags: string[] }
  | { action: 'setOwner'; ownerId: string | null }
  | { action: 'setGlobalStatus'; globalStatus: GlobalStatus; status?: CandidateStatus }
  | { action: 'linkJob'; jobId: string }
  | { action: 'delete' };

export type ImportRow = Record<string, unknown>;

export interface ImportPreviewRow {
  index: number;
  valid: boolean;
  duplicates: DuplicateMatch[];
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; error: string }[];
}

export const candidateApi = {
  getCandidates: async (): Promise<Candidate[]> => {
    const res = await api.get<ApiResponse<Candidate[]>>('/candidates');
    return res.data.data!;
  },

  getCandidate: async (id: string): Promise<Candidate> => {
    const res = await api.get<ApiResponse<Candidate>>(`/candidates/${id}`);
    return res.data.data!;
  },

  shortlist: async (id: string, jobId: string): Promise<Candidate> => {
    const res = await api.post<ApiResponse<Candidate>>(`/candidates/${id}/shortlist`, { jobId });
    return res.data.data!;
  },

  reject: async (
    id: string,
    jobId: string,
    rejection?: { rejectionReason?: RejectionReason; rejectionNote?: string }
  ): Promise<Candidate> => {
    const res = await api.post<ApiResponse<Candidate>>(`/candidates/${id}/reject`, { jobId, ...rejection });
    return res.data.data!;
  },

  selectCandidate: async (id: string, jobId: string): Promise<Candidate> => {
    const res = await api.post<ApiResponse<Candidate>>(`/candidates/${id}/select`, { jobId });
    return res.data.data!;
  },

  requestInterview: async (
    id: string,
    jobId: string,
    data: { preferredDates?: string; notes?: string }
  ): Promise<Candidate> => {
    const res = await api.post<ApiResponse<Candidate>>(`/candidates/${id}/request-interview`, { jobId, ...data });
    return res.data.data!;
  },

  submitFeedback: async (id: string, feedback: string, rating?: number): Promise<void> => {
    await api.post(`/candidates/${id}/feedback`, { feedback, rating });
  },

  deleteFeedback: async (id: string, feedbackId: string): Promise<Candidate> => {
    const res = await api.delete<ApiResponse<Candidate>>(`/candidates/${id}/feedback/${feedbackId}`);
    return res.data.data!;
  },

  submitInterviewFeedback: async (
    id: string,
    jobId: string,
    round: number,
    feedback: string,
    rating?: number
  ): Promise<Candidate> => {
    const res = await api.post<ApiResponse<Candidate>>(`/candidates/${id}/interview-feedback`, {
      jobId,
      round,
      feedback,
      rating,
    });
    return res.data.data!;
  },

  deleteInterviewFeedback: async (id: string, feedbackId: string): Promise<Candidate> => {
    const res = await api.delete<ApiResponse<Candidate>>(`/candidates/${id}/interview-feedback/${feedbackId}`);
    return res.data.data!;
  },

  createCandidate: async (data: {
    jobId?: string;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    currentlyWorking?: boolean;
    currentTitle?: string;
    currentCompany?: string;
    location?: string;
    skills?: string[];
    linkedinUrl?: string;
    website?: string;
    notes?: string;
    source?: CandidateSource;
    noticePeriod?: number;
  } & CandidateProfileInput): Promise<Candidate> => {
    const res = await api.post<ApiResponse<Candidate>>('/candidates', data);
    return res.data.data!;
  },

  updateGlobalStatus: async (
    id: string,
    globalStatus: GlobalStatus,
    status: CandidateStatus
  ): Promise<Candidate> => {
    const res = await api.patch<ApiResponse<Candidate>>(`/candidates/${id}/global-status`, {
      globalStatus,
      status,
    });
    return res.data.data!;
  },

  linkToJob: async (id: string, jobId: string): Promise<Candidate> => {
    const res = await api.post<ApiResponse<Candidate>>(`/candidates/${id}/link-job`, { jobId });
    return res.data.data!;
  },

  updateCandidate: async (
    id: string,
    data: {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      currentlyWorking?: boolean;
      currentTitle?: string;
      currentCompany?: string;
      location?: string;
      skills?: string[];
      linkedinUrl?: string;
      website?: string;
      notes?: string;
      noticePeriod?: number;
    } & CandidateProfileInput
  ): Promise<Candidate> => {
    const res = await api.patch<ApiResponse<Candidate>>(`/candidates/${id}`, data);
    return res.data.data!;
  },

  uploadResume: async (id: string, file: File): Promise<Candidate> => {
    const form = new FormData();
    form.append('resume', file);
    // No explicit Content-Type here — the browser must generate its own
    // multipart boundary for FormData bodies. Setting the header ourselves
    // (even to 'multipart/form-data') suppresses that per the XHR/fetch spec,
    // so the request goes out with no boundary and the server can't parse it.
    const res = await api.post<ApiResponse<Candidate>>(`/candidates/${id}/resume`, form);
    return res.data.data!;
  },

  // Fetches the resume with the auth header attached — a plain <a href> can't
  // carry the Authorization header this authenticated route requires, so both
  // "view" and "download" below go through this and hand the browser a blob.
  getResumeBlob: async (id: string): Promise<Blob> => {
    const res = await api.get(`/candidates/${id}/resume`, { responseType: 'blob' });
    return res.data;
  },

  downloadResume: async (id: string, fileName?: string): Promise<void> => {
    const blob = await candidateApi.getResumeBlob(id);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || 'resume';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  // Opens the resume in a new tab for viewing. `tab` should be a window handle
  // opened synchronously in the click handler (window.open('', '_blank')) —
  // opening it only after this async fetch resolves gets blocked by popup
  // blockers, since it's no longer inside the original user gesture.
  viewResume: async (id: string, tab: Window | null): Promise<void> => {
    const blob = await candidateApi.getResumeBlob(id);
    const url = window.URL.createObjectURL(blob);
    if (tab) tab.location.href = url;
    else window.open(url, '_blank', 'noopener');
    // Delay revocation so the new tab has time to load the resource — it's
    // reading the same blob URL, not a copy.
    setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
  },

  deleteResume: async (id: string): Promise<Candidate> => {
    const res = await api.delete<ApiResponse<Candidate>>(`/candidates/${id}/resume`);
    return res.data.data!;
  },

  uploadPhoto: async (id: string, file: File): Promise<Candidate> => {
    const form = new FormData();
    form.append('photo', file);
    const res = await api.post<ApiResponse<Candidate>>(`/candidates/${id}/photo`, form);
    return res.data.data!;
  },

  // Same reasoning as getResumeBlob: the route is authenticated, so a plain
  // <img src> can't carry the token — fetch it through axios and hand back a blob.
  getPhotoBlob: async (id: string): Promise<Blob> => {
    const res = await api.get(`/candidates/${id}/photo`, { responseType: 'blob' });
    return res.data;
  },

  deletePhoto: async (id: string): Promise<Candidate> => {
    const res = await api.delete<ApiResponse<Candidate>>(`/candidates/${id}/photo`);
    return res.data.data!;
  },

  // ---- Recruiter workflow ------------------------------------------------

  /** Kanban move. Clients may only move to SHORTLISTED / INTERVIEW / OFFER / REJECTED. */
  setStage: async (
    id: string,
    jobId: string,
    stage: CandidateStage,
    rejection?: { rejectionReason?: RejectionReason; rejectionNote?: string }
  ): Promise<Candidate> => {
    const res = await api.patch<ApiResponse<Candidate>>(`/candidates/${id}/stage`, { jobId, stage, ...rejection });
    return res.data.data!;
  },

  /** SWFS submits a screened candidate to the client for one role (admin only). */
  submitToClient: async (id: string, jobId: string, note?: string): Promise<Candidate> => {
    const res = await api.post<ApiResponse<Candidate>>(`/candidates/${id}/submit`, { jobId, note });
    return res.data.data!;
  },

  deleteCandidate: async (id: string): Promise<void> => {
    await api.delete(`/candidates/${id}`);
  },

  /** Paged list (both roles) — clients are scoped to their own roles server-side. */
  list: async (params: {
    q?: string;
    globalStatus?: string;
    jobId?: string;
    stage?: string;
    source?: string;
    masterPool?: boolean;
    page?: number;
    pageSize?: number;
    sort?: string;
  }): Promise<CandidatePage> => {
    const res = await api.get<ApiResponse<CandidatePage>>('/candidates/list', {
      params: { ...params, masterPool: params.masterPool ? 'true' : undefined },
    });
    return res.data.data!;
  },

  /** Every page of a list query — for exports. Capped at 5,000 rows. */
  listAll: async (params: { q?: string; globalStatus?: string; jobId?: string; masterPool?: boolean }): Promise<Candidate[]> => {
    const out: Candidate[] = [];
    for (let page = 1; page <= 25; page++) {
      const res = await candidateApi.list({ ...params, page, pageSize: 200 });
      out.push(...res.items);
      if (out.length >= res.total || !res.items.length) break;
    }
    return out;
  },

  search: async (params: CandidateSearchParams): Promise<MatchedSearchPage> => {
    const res = await api.get<ApiResponse<MatchedSearchPage>>('/candidates/search', { params });
    return res.data.data!;
  },

  /** Every page of a talent search (same filters), for "Export all". Capped at 5,000 rows. */
  searchAll: async (params: CandidateSearchParams): Promise<Candidate[]> => {
    const out: Candidate[] = [];
    for (let page = 1; page <= 25; page++) {
      const res = await candidateApi.search({ ...params, page, pageSize: 200 });
      out.push(...res.items);
      if (out.length >= res.total || !res.items.length) break;
    }
    return out;
  },

  findDuplicates: async (probe: {
    email?: string;
    phone?: string;
    linkedinUrl?: string;
    firstName?: string;
    lastName?: string;
    excludeId?: string;
  }): Promise<DuplicateMatch[]> => {
    const res = await api.get<ApiResponse<DuplicateMatch[]>>('/candidates/duplicates', { params: probe });
    return res.data.data!;
  },

  getTags: async (): Promise<{ tag: string; count: number }[]> => {
    const res = await api.get<ApiResponse<{ tag: string; count: number }[]>>('/candidates/tags');
    return res.data.data!;
  },

  bulk: async (ids: string[], op: BulkAction): Promise<{ affected: number }> => {
    const res = await api.post<ApiResponse<{ affected: number }>>('/candidates/bulk', { ids, ...op });
    return res.data.data!;
  },

  previewImport: async (rows: ImportRow[]): Promise<ImportPreviewRow[]> => {
    const res = await api.post<ApiResponse<ImportPreviewRow[]>>('/candidates/import/preview', { rows });
    return res.data.data!;
  },

  importCandidates: async (
    rows: ImportRow[],
    strategy: 'skip' | 'update' | 'create',
    jobId?: string
  ): Promise<ImportResult> => {
    const res = await api.post<ApiResponse<ImportResult>>('/candidates/import', { rows, strategy, jobId });
    return res.data.data!;
  },
};
