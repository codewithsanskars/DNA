import api from './axios';
import { ApiResponse, ClientHome, DashboardInsights, DashboardSummary } from '../types';

export const dashboardApi = {
  getSummary: async (): Promise<DashboardSummary> => {
    const res = await api.get<ApiResponse<DashboardSummary>>('/dashboard');
    return res.data.data!;
  },

  /** Optional `jobId` narrows every chart and KPI to one role. */
  getInsights: async (jobId?: string): Promise<DashboardInsights> => {
    const res = await api.get<ApiResponse<DashboardInsights>>('/dashboard/insights', { params: { jobId } });
    return res.data.data!;
  },

  /** Client org users only. */
  getClientHome: async (): Promise<ClientHome> => {
    const res = await api.get<ApiResponse<ClientHome>>('/dashboard/client-home');
    return res.data.data!;
  },
};
