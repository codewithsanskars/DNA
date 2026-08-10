import api from './axios';
import { ApiResponse, DashboardSummary } from '../types';

export const dashboardApi = {
  getSummary: async (): Promise<DashboardSummary> => {
    const res = await api.get<ApiResponse<DashboardSummary>>('/dashboard');
    return res.data.data!;
  },
};
