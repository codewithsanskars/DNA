import api from './axios';
import { ApiResponse, AuthUser } from '../types';

export const authApi = {
  login: async (email: string): Promise<{ token: string; user: AuthUser }> => {
    const res = await api.post<ApiResponse<{ token: string; user: AuthUser }>>('/auth/login', { email });
    return res.data.data!;
  },

  me: async (): Promise<AuthUser> => {
    const res = await api.get<ApiResponse<AuthUser>>('/auth/me');
    return res.data.data!;
  },

  getOktaStatus: async (): Promise<{ configured: boolean }> => {
    const res = await api.get<ApiResponse<{ configured: boolean }>>('/auth/okta/status');
    return res.data.data!;
  },

  getOktaLoginUrl: (): string => '/api/auth/okta/login',

  completeOktaRegistration: async (
    pendingToken: string,
    organizationName: string
  ): Promise<{ token: string; user: AuthUser }> => {
    const res = await api.post<ApiResponse<{ token: string; user: AuthUser }>>('/auth/okta/register', {
      pendingToken,
      organizationName,
    });
    return res.data.data!;
  },

  updateProfile: async (data: { name: string; email: string }): Promise<AuthUser> => {
    const res = await api.patch<ApiResponse<AuthUser>>('/auth/me', data);
    return res.data.data!;
  },

  uploadAvatar: async (file: File): Promise<AuthUser> => {
    const formData = new FormData();
    formData.append('avatar', file);
    const res = await api.post<ApiResponse<AuthUser>>('/auth/me/avatar', formData);
    return res.data.data!;
  },

  removeAvatar: async (): Promise<AuthUser> => {
    const res = await api.delete<ApiResponse<AuthUser>>('/auth/me/avatar');
    return res.data.data!;
  },
};
