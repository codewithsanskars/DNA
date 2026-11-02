import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Icon from '../shared/Icon';
import NotificationItem from './NotificationItem';
import { useAuth } from '../../context/AuthContext';
import { useTaskSummary } from '../../hooks/useWorkflow';
import { useMarkNotifications, useNotificationList, useUnreadNotificationCount } from '../../hooks/useNotifications';
import { pipelineApi } from '../../api/pipeline.api';
import { queryKeys } from '../../api/queryKeys';
import { isAdminRole } from '../../utils/roles';
import { formatDateTime } from '../../utils/format';
import { AppNotification } from '../../types';

/**
 * Notification bell, both roles. The list is the user's own notifications
 * (generated server-side per role — clients only ever hear about their own
 * roles). "Coming up" adds time-based reminders that aren't stored: tasks
 * due for SWFS staff, and interviews in the next 48 hours for everyone.
 */
export default function NotificationBell() {
  const { user } = useAuth();
  const admin = isAdminRole(user?.role);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const { data: unread = 0 } = useUnreadNotificationCount();
  const { data: items = [], isLoading } = useNotificationList({ limit: 12 }, open);
  const { markRead, markAllRead } = useMarkNotifications();
  const { data: tasks } = useTaskSummary();
  const { data: interviews = [] } = useQuery({
    queryKey: [...queryKeys.upcomingInterviews, 2],
    queryFn: () => pipelineApi.getUpcomingInterviews(2),
    enabled: !!user,
    refetchInterval: 5 * 60_000,
  });
  const soon = interviews.filter((i) => new Date(i.scheduledAt).getTime() > Date.now());

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const dueTasks = admin ? (tasks?.overdue ?? 0) + (tasks?.dueToday ?? 0) : 0;
  const badge = unread + dueTasks;

  const openItem = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate([n.id]);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const hasReminders = dueTasks > 0 || soon.length > 0;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={badge ? `Notifications (${badge} new)` : 'Notifications'}
        aria-expanded={open}
        title="Notifications"
        onClick={() => setOpen((v) => !v)}
        className={[
          'relative flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground',
          'transition-[transform,background-color,border-color,color] duration-150',
          'hover:bg-muted hover:text-foreground hover:border-border-strong',
          'active:scale-[0.92] active:bg-border',
          open ? 'bg-muted text-foreground border-border-strong' : 'border-border-strong',
        ].join(' ')}
      >
        <Icon name="bell" size={15} />
        {badge > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-30 flex max-h-[min(36rem,80vh)] w-[22rem] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg animate-scale-in">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-[13px] font-semibold text-foreground">
              Notifications
              {unread > 0 && <span className="ml-1.5 font-normal text-muted-foreground">{unread} unread</span>}
            </p>
            {unread > 0 && (
              <button type="button" onClick={() => markAllRead.mutate()} className="text-xs font-medium text-brand-text hover:underline">
                Mark all read
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {hasReminders && (
              <div className="border-b border-border">
                <p className="px-4 pb-1 pt-2.5 text-2xs font-semibold uppercase tracking-wider text-subtle-foreground">Coming up</p>
                {dueTasks > 0 && (
                  <Link to="/my-work" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-subtle-foreground ring-1 ring-inset ring-border">
                      <Icon name="check-square" size={13} />
                    </span>
                    <span className="text-[13px] text-foreground">
                      {tasks!.overdue > 0 && <span className="font-semibold text-rose-600 dark:text-rose-400">{tasks!.overdue} overdue</span>}
                      {tasks!.overdue > 0 && tasks!.dueToday > 0 && ' · '}
                      {tasks!.dueToday > 0 && `${tasks!.dueToday} due today`}
                    </span>
                  </Link>
                )}
                {soon.slice(0, 4).map((i) => (
                  <Link key={i.id} to={`/candidates/${i.candidateId}`} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-subtle-foreground ring-1 ring-inset ring-border">
                      <Icon name="calendar" size={13} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] text-foreground">Interview · {i.candidateName}</span>
                      <span className="block truncate text-2xs text-subtle-foreground">
                        {formatDateTime(i.scheduledAt)} · {i.jobTitle}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            )}

            {isLoading ? (
              <p className="px-4 py-8 text-center text-xs text-muted-foreground">Loading…</p>
            ) : items.length === 0 ? (
              !hasReminders && (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <Icon name="bell" size={20} className="text-subtle-foreground" />
                  <p className="text-[13px] text-muted-foreground">You&rsquo;re all caught up</p>
                  <p className="max-w-[16rem] text-2xs text-subtle-foreground">
                    {admin
                      ? 'You’ll hear when clients act on candidates, when teammates mention you, or assign you tasks.'
                      : 'You’ll hear when SWFS submits candidates, schedules interviews or updates offers on your roles.'}
                  </p>
                </div>
              )
            ) : (
              <div className="divide-y divide-border">
                {items.map((n) => (
                  <NotificationItem key={n.id} n={n} onOpen={openItem} onMarkRead={(x) => markRead.mutate([x.id])} />
                ))}
              </div>
            )}
          </div>

          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="border-t border-border bg-muted px-4 py-2.5 text-center text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
