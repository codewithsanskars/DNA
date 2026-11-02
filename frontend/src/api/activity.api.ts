import api from './axios';
import { ApiResponse, AuditLog, Paged } from '../types';

export const activityApi = {
  getActivity: async (limit = 50): Promise<AuditLog[]> => {
    const res = await api.get<ApiResponse<AuditLog[]>>(`/activity?limit=${limit}`);
    return res.data.data!;
  },

  /** Paged activity log (newest first), scoped to the caller's org for clients. */
  getActivityPage: async (page: number, pageSize = 50): Promise<Paged<AuditLog>> => {
    const res = await api.get<ApiResponse<Paged<AuditLog>>>('/activity', { params: { page, pageSize } });
    return res.data.data!;
  },
};
