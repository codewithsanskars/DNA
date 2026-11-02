import api from './axios';
import { ApiResponse, AppNotification } from '../types';

/** The signed-in user's own notifications (both roles). */
export const notificationApi = {
  list: async (params: { unread?: boolean; limit?: number; before?: string } = {}): Promise<AppNotification[]> => {
    const res = await api.get<ApiResponse<AppNotification[]>>('/notifications', {
      params: { ...params, unread: params.unread ? 'true' : undefined },
    });
    return res.data.data!;
  },

  unreadCount: async (): Promise<number> => {
    const res = await api.get<ApiResponse<{ count: number }>>('/notifications/unread-count');
    return res.data.data!.count;
  },

  markRead: async (ids: string[]): Promise<number> => {
    const res = await api.post<ApiResponse<{ count: number }>>('/notifications/read', { ids });
    return res.data.data!.count;
  },

  markAllRead: async (): Promise<void> => {
    await api.post('/notifications/read-all');
  },
};
