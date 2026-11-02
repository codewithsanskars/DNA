import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import AppLayout from '../components/layout/AppLayout';
import NotificationItem from '../components/layout/NotificationItem';
import Button from '../components/shared/Button';
import Icon from '../components/shared/Icon';
import { notificationApi } from '../api/notification.api';
import { queryKeys } from '../api/queryKeys';
import { useAuth } from '../context/AuthContext';
import { useMarkNotifications, useNotificationList, useUnreadNotificationCount } from '../hooks/useNotifications';
import { isAdminRole } from '../utils/roles';
import { AppNotification } from '../types';

const PAGE = 50;

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

/** Full notification history for the signed-in user (both roles). */
export default function NotificationsPage() {
  const { user } = useAuth();
  const admin = isAdminRole(user?.role);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [older, setOlder] = useState<AppNotification[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  const { data: first = [], isLoading } = useNotificationList({ unread: unreadOnly, limit: PAGE });
  const { data: unread = 0 } = useUnreadNotificationCount();
  const { markRead, markAllRead } = useMarkNotifications();

  const items = [...first, ...older.filter((o) => !first.some((f) => f.id === o.id))];
  const canLoadMore = !exhausted && first.length === PAGE;

  const switchFilter = (u: boolean) => {
    setUnreadOnly(u);
    setOlder([]);
    setExhausted(false);
  };

  const loadMore = async () => {
    const last = items[items.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const page = await notificationApi.list({ unread: unreadOnly, limit: PAGE, before: last.createdAt });
      setOlder((o) => [...o, ...page]);
      if (page.length < PAGE) setExhausted(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const open = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate([n.id]);
    if (n.link) navigate(n.link);
  };

  const markOne = (n: AppNotification) => {
    markRead.mutate([n.id]);
    setOlder((o) => o.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
  };

  let lastDay = '';

  return (
    <AppLayout
      title="Notifications"
      actions={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex rounded-md border border-border bg-card p-0.5 shadow-xs" role="group" aria-label="Filter">
            {([false, true] as const).map((u) => (
              <button
                key={String(u)}
                type="button"
                aria-pressed={unreadOnly === u}
                onClick={() => switchFilter(u)}
                className={`rounded px-2.5 py-1 text-xs font-medium ${unreadOnly === u ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {u ? `Unread${unread ? ` (${unread})` : ''}` : 'All'}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="secondary"
            icon="check"
            disabled={!unread}
            loading={markAllRead.isPending}
            onClick={() =>
              markAllRead.mutate(undefined, {
                onSuccess: () => {
                  setOlder((o) => o.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
                  queryClient.invalidateQueries({ queryKey: queryKeys.allNotifications });
                },
              })
            }
          >
            Mark all read
          </Button>
        </div>
      }
    >
      <div className="mx-auto max-w-3xl">
        <p className="mb-4 text-xs text-muted-foreground">
          {admin
            ? 'Client activity on candidates and roles, teammates’ @mentions, and tasks assigned to you.'
            : 'SWFS activity on your roles: new candidate submissions, interviews, offers, placements and role changes.'}
        </p>
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
          {isLoading ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
              <Icon name="bell" size={22} className="text-subtle-foreground" />
              <p className="text-sm font-medium text-foreground">{unreadOnly ? 'No unread notifications' : 'No notifications yet'}</p>
            </div>
          ) : (
            items.map((n) => {
              const day = dayLabel(n.createdAt);
              const header = day !== lastDay ? day : null;
              lastDay = day;
              return (
                <div key={n.id} className="border-b border-border last:border-0">
                  {header && (
                    <p className="border-b border-border bg-muted px-4 py-1.5 text-2xs font-semibold uppercase tracking-wider text-subtle-foreground">{header}</p>
                  )}
                  <NotificationItem n={n} onOpen={open} onMarkRead={markOne} />
                </div>
              );
            })
          )}
        </div>
        {canLoadMore && (
          <div className="mt-4 flex justify-center">
            <Button size="sm" variant="secondary" loading={loadingMore} onClick={loadMore}>
              Load older
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
