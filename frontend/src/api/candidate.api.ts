import api from './axios';
import { ApiResponse, Candidate, GlobalStatus, CandidateStatus } from '../types';

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

  reject: async (id: string, jobId: string): Promise<Candidate> => {
    const res = await api.post<ApiResponse<Candidate>>(`/candidates/${id}/reject`, { jobId });
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

  createCandidate: async (data: {
    jobId?: string;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    currentTitle?: string;
    currentCompany?: string;
    location?: string;
    skills?: string[];
    linkedinUrl?: string;
    website?: string;
    notes?: string;
    source?: 'PORTAL' | 'LINKEDIN';
    noticePeriod?: number;
  }): Promise<Candidate> => {
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
      currentTitle?: string;
      currentCompany?: string;
      location?: string;
      skills?: string[];
      linkedinUrl?: string;
      website?: string;
      notes?: string;
      noticePeriod?: number;
    }
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
};
