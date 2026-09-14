import api from './axios';
import { ApiResponse, AuditLog } from '../types';

export const activityApi = {
  getActivity: async (limit = 50): Promise<AuditLog[]> => {
    const res = await api.get<ApiResponse<AuditLog[]>>(`/activity?limit=${limit}`);
    return res.data.data!;
  },
};
