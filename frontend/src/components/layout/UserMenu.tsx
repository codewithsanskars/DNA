import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../shared/Avatar';

export default function UserMenu() {
  const { user } = useAuth();
  const navigate = useNavigate();
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

  if (!user) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        title="Account menu"
        onClick={() => setOpen((v) => !v)}
        className={[
          'flex items-center gap-2.5 rounded-md px-1.5 py-1 transition-colors duration-150',
          'hover:bg-muted',
          open ? 'bg-muted' : '',
        ].join(' ')}
      >

        <Avatar name={user.name || user.email} title={user.name} imageUrl={user.avatarUrl} />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-64 rounded-lg border border-border bg-card shadow-lg animate-scale-in">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate('/settings');
            }}
            className="flex w-full items-center gap-2.5 border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted"
          >
            <Avatar name={user.name || user.email} title={user.name} imageUrl={user.avatarUrl} />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-foreground">{user.name || user.email}</p>
              {user.name && <p className="truncate text-xs text-muted-foreground">{user.email}</p>}
            </div>
          </button>

          <div className="flex flex-col py-1">
            <div className="flex items-center px-4 py-2.5 text-[13px] text-foreground">
              {user.role}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
