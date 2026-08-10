import api from './axios';
import { ApiResponse, Job, Candidate, WorkType, PayrollType } from '../types';

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
    openedAt?: string;
    description?: string;
    payRate?: string;
    billableHours?: string;
    workType?: WorkType;
    payrollType?: PayrollType;
  }): Promise<Job> => {
    const res = await api.post<ApiResponse<Job>>('/jobs', data);
    return res.data.data!;
  },
};
