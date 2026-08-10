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

  getOktaLoginUrl: (): string => '/api/auth/okta/login',
};
