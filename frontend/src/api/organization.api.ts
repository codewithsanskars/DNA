import api from './axios';
import { ApiResponse, Organization, AuditLog } from '../types';

export const organizationApi = {
  getProfile: async (): Promise<Organization> => {
    const res = await api.get<ApiResponse<Organization>>('/organization');
    return res.data.data!;
  },

  getOrganizations: async (): Promise<Organization[]> => {
    const res = await api.get<ApiResponse<Organization[]>>('/organization/list');
    return res.data.data!;
  },

  getOrganization: async (id: string): Promise<Organization> => {
    const res = await api.get<ApiResponse<Organization>>(`/organization/${id}`);
    return res.data.data!;
  },
};

export const activityApi = {
  getActivity: async (limit = 50): Promise<AuditLog[]> => {
    const res = await api.get<ApiResponse<AuditLog[]>>(`/activity?limit=${limit}`);
    return res.data.data!;
  },
};
