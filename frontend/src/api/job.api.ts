import api from './axios';
import { ApiResponse, Job, Candidate, WorkType, PayrollType, JobPriority } from '../types';

export const jobApi = {
  getJobs: async (): Promise<Job[]> => {
    const res = await api.get<ApiResponse<Job[]>>('/jobs');
    return res.data.data!;
  },

  getJob: async (id: string): Promise<Job> => {
    const res = await api.get<ApiResponse<Job>>(`/jobs/${id}`);
    return res.data.data!;
  },

  getJobPipeline: async (id: string): Promise<Candidate[]> => {
    const res = await api.get<ApiResponse<Candidate[]>>(`/jobs/${id}/pipeline`);
    return res.data.data!;
  },

  createJob: async (data: {
    title: string;
    department?: string;
    location?: string;
    status?: string;
    priority?: JobPriority;
    openedAt?: string;
    description?: string;
    payRate?: number;
    billRate?: number;
    billableHours?: string;
    workType?: WorkType;
    payrollType?: PayrollType;
    organizationId?: string;
  }): Promise<Job> => {
    const res = await api.post<ApiResponse<Job>>('/jobs', data);
    return res.data.data!;
  },

  updateJob: async (
    id: string,
    data: {
      title?: string;
      department?: string;
      location?: string;
      status?: string;
      priority?: JobPriority;
      description?: string;
      payRate?: number;
      billRate?: number;
      billableHours?: string;
      workType?: WorkType;
      payrollType?: PayrollType;
    }
  ): Promise<Job> => {
    const res = await api.patch<ApiResponse<Job>>(`/jobs/${id}`, data);
    return res.data.data!;
  },

  uploadJobDescription: async (id: string, file: File): Promise<Job> => {
    const form = new FormData();
    form.append('jobDescription', file);
    // No explicit Content-Type here — the browser must generate its own
    // multipart boundary for FormData bodies. Setting the header ourselves
    // (even to 'multipart/form-data') suppresses that per the XHR/fetch spec,
    // so the request goes out with no boundary and the server can't parse it.
    const res = await api.post<ApiResponse<Job>>(`/jobs/${id}/description`, form);
    return res.data.data!;
  },

  // Fetches the JD with the auth header attached — a plain <a href> can't
  // carry the Authorization header this authenticated route requires, so both
  // "view" and "download" below go through this and hand the browser a blob.
  getJobDescriptionBlob: async (id: string): Promise<Blob> => {
    const res = await api.get(`/jobs/${id}/description`, { responseType: 'blob' });
    return res.data;
  },

  downloadJobDescription: async (id: string, fileName?: string): Promise<void> => {
    const blob = await jobApi.getJobDescriptionBlob(id);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || 'job-description';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  deleteJobDescription: async (id: string): Promise<Job> => {
    const res = await api.delete<ApiResponse<Job>>(`/jobs/${id}/description`);
    return res.data.data!;
  },
};
