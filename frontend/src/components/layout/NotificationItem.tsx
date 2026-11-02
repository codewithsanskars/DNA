import { AppNotification } from '../../types';
import { notificationIcon } from '../../hooks/useNotifications';
import { formatDateTime, timeAgo } from '../../utils/format';
import Icon from '../shared/Icon';

/** One notification row — shared by the bell dropdown and the Notifications page. */
export default function NotificationItem({
  n,
  onOpen,
  onMarkRead,
}: {
  n: AppNotification;
  onOpen: (n: AppNotification) => void;
  onMarkRead?: (n: AppNotification) => void;
}) {
  const unread = !n.readAt;
  return (
    <div className={`group relative flex gap-3 px-4 py-3 transition-colors hover:bg-muted ${unread ? 'bg-brand-subtle/30' : ''}`}>
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ${
          unread ? 'bg-brand-subtle text-brand-text ring-brand/20' : 'bg-muted text-subtle-foreground ring-border'
        }`}
      >
        <Icon name={notificationIcon(n.type)} size={13} />
      </span>
      <button type="button" onClick={() => onOpen(n)} className="min-w-0 flex-1 text-left after:absolute after:inset-0">
        <p className={`text-[13px] leading-snug ${unread ? 'font-semibold text-foreground' : 'text-foreground'}`}>{n.title}</p>
        {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
        <p className="mt-1 text-2xs text-subtle-foreground" title={formatDateTime(n.createdAt)}>
          {timeAgo(n.createdAt)}
        </p>
      </button>
      {unread && onMarkRead && (
        <button
          type="button"
          onClick={() => onMarkRead(n)}
          title="Mark as read"
          aria-label="Mark as read"
          className="relative z-10 mt-1.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
        >
          <span className="h-2 w-2 rounded-full bg-brand transition-transform group-hover:scale-125" />
        </button>
      )}
    </div>
  );
}
