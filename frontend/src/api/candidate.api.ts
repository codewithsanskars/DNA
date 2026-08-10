import api from './axios';
import { ApiResponse, Candidate } from '../types';

export const candidateApi = {
  getCandidate: async (id: string): Promise<Candidate> => {
    const res = await api.get<ApiResponse<Candidate>>(`/candidates/${id}`);
    return res.data.data!;
  },

  shortlist: async (id: string): Promise<Candidate> => {
    const res = await api.post<ApiResponse<Candidate>>(`/candidates/${id}/shortlist`);
    return res.data.data!;
  },

  reject: async (id: string): Promise<Candidate> => {
    const res = await api.post<ApiResponse<Candidate>>(`/candidates/${id}/reject`);
    return res.data.data!;
  },

  requestInterview: async (id: string, data: { preferredDates?: string; notes?: string }): Promise<Candidate> => {
    const res = await api.post<ApiResponse<Candidate>>(`/candidates/${id}/request-interview`, data);
    return res.data.data!;
  },

  submitFeedback: async (id: string, feedback: string, rating?: number): Promise<void> => {
    await api.post(`/candidates/${id}/feedback`, { feedback, rating });
  },

  createCandidate: async (data: {
    jobId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    currentTitle?: string;
    currentCompany?: string;
    location?: string;
    skills?: string[];
    linkedinUrl?: string;
  }): Promise<Candidate> => {
    const res = await api.post<ApiResponse<Candidate>>('/candidates', data);
    return res.data.data!;
  },
};
