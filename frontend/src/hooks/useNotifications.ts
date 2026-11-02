import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationApi } from '../api/notification.api';
import { queryKeys } from '../api/queryKeys';
import { useAuth } from '../context/AuthContext';
import { IconName } from '../components/shared/Icon';

const POLL_MS = 30_000;

export function useUnreadNotificationCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.notificationCount,
    queryFn: notificationApi.unreadCount,
    enabled: !!user,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
  });
}

export function useNotificationList(params: { unread?: boolean; limit?: number }, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.notifications(params),
    queryFn: () => notificationApi.list(params),
    enabled: !!user && enabled,
    refetchInterval: enabled ? POLL_MS : false,
  });
}

export function useMarkNotifications() {
  const queryClient = useQueryClient();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.allNotifications });
  };
  const markRead = useMutation({ mutationFn: (ids: string[]) => notificationApi.markRead(ids), onSuccess: refresh });
  const markAllRead = useMutation({ mutationFn: notificationApi.markAllRead, onSuccess: refresh });
  return { markRead, markAllRead };
}

/** Icon per notification type — falls back to a bell. */
export function notificationIcon(type: string): IconName {
  if (type.includes('INTERVIEW')) return 'calendar';
  if (type.includes('OFFER')) return 'mail';
  if (type.includes('PLACEMENT') || type === 'CANDIDATE_HIRED') return 'award';
  if (type.includes('ROLE')) return 'briefcase';
  if (type.includes('FEEDBACK')) return 'message';
  const map: Record<string, IconName> = {
    CLIENT_SHORTLISTED: 'star',
    CLIENT_REJECTED: 'close',
    CLIENT_SELECTED: 'check',
    CANDIDATE_SELECTED: 'check',
    CLIENT_STAGE_CHANGED: 'columns',
    CLIENT_LINKED: 'user-plus',
    CANDIDATE_SUBMITTED: 'users',
    CLIENT_VIEWED: 'external',
    MENTION: 'at',
    TASK_ASSIGNED: 'check-square',
  };
  return map[type] ?? 'bell';
}
