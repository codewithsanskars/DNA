import { useEffect, useRef, useState } from 'react';
import Icon from '../shared/Icon';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        title="Notifications"
        onClick={() => setOpen((v) => !v)}
        className={[
          'flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground',
          'transition-[transform,background-color,border-color,color] duration-150',
          'hover:bg-muted hover:text-foreground hover:border-border-strong',
          'active:scale-[0.92] active:bg-border',
          open ? 'bg-muted text-foreground border-border-strong' : 'border-border-strong',
        ].join(' ')}
      >
        <Icon name="bell" size={15} />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-80 rounded-lg border border-border bg-card shadow-lg animate-scale-in">
          <div className="border-b border-border px-4 py-3">
            <p className="text-[13px] font-semibold text-foreground">Notifications</p>
          </div>
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <Icon name="bell" size={20} className="text-subtle-foreground" />
            <p className="text-[13px] text-muted-foreground">You&rsquo;re all caught up</p>
          </div>
        </div>
      )}
    </div>
  );
}
