import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  CSSProperties,
  ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import Icon, { IconName } from './Icon';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  title: string;
  description?: string;
  duration: number;
}

interface ToastOptions {
  type?: ToastType;
  title: string;
  description?: string;
  duration?: number;
}

interface ToastApi {
  toast: (opts: ToastOptions) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

interface TimerEntry {
  handle: ReturnType<typeof setTimeout> | undefined;
  remaining: number;
  startedAt: number;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS: Record<ToastType, IconName> = { success: 'check', error: 'alert', info: 'activity' };
const ACCENTS: Record<ToastType, string> = {
  success: 'text-emerald-500',
  error: 'text-rose-500',
  info: 'text-muted-foreground',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [paused, setPaused] = useState(false);
  const idRef = useRef(0);
  const pausedRef = useRef(false);
  const timers = useRef<Record<number, TimerEntry>>({});

  const dismiss = useCallback((id: number) => {
    const entry = timers.current[id];
    if (entry?.handle) clearTimeout(entry.handle);
    delete timers.current[id];
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (opts: ToastOptions) => {
      const id = ++idRef.current;
      const type = opts.type ?? 'info';
      const duration = opts.duration ?? (type === 'error' ? 6000 : 4000);
      setItems((list) => [
        ...list.slice(-3),
        { id, type, title: opts.title, description: opts.description, duration },
      ]);
      const entry: TimerEntry = { handle: undefined, remaining: duration, startedAt: Date.now() };
      if (!pausedRef.current) {
        entry.handle = setTimeout(() => dismiss(id), duration);
      }
      timers.current[id] = entry;
    },
    [dismiss]
  );

  const pauseAll = useCallback(() => {
    if (pausedRef.current) return;
    pausedRef.current = true;
    setPaused(true);
    const now = Date.now();
    for (const entry of Object.values(timers.current)) {
      if (entry.handle) clearTimeout(entry.handle);
      entry.handle = undefined;
      entry.remaining = Math.max(0, entry.remaining - (now - entry.startedAt));
    }
  }, []);

  const resumeAll = useCallback(() => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    setPaused(false);
    const now = Date.now();
    for (const [key, entry] of Object.entries(timers.current)) {
      const id = Number(key);
      entry.startedAt = now;
      entry.handle = setTimeout(() => dismiss(id), entry.remaining);
    }
  }, [dismiss]);

  const api = useMemo<ToastApi>(
    () => ({
      toast: push,
      success: (title, description) => push({ type: 'success', title, description }),
      error: (title, description) => push({ type: 'error', title, description }),
      info: (title, description) => push({ type: 'info', title, description }),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-end p-4 sm:inset-x-auto sm:right-0 sm:p-6"
          aria-live="polite"
        >
          <div
            className="pointer-events-auto flex flex-col items-end gap-2"
            onMouseEnter={pauseAll}
            onMouseLeave={resumeAll}
          >
            {items.map((t) => (
              <div
                key={t.id}
                role="status"
                className="animate-toast-in relative flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-lg border border-border bg-card p-3.5 shadow-lg"
              >
                <Icon name={ICONS[t.type]} size={16} className={`mt-px shrink-0 ${ACCENTS[t.type]}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-foreground">{t.title}</p>
                  {t.description && (
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {t.description}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss notification"
                  className="-mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-subtle-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Icon name="close" size={14} />
                </button>
                <span
                  aria-hidden="true"
                  className={`toast-progress-bar absolute inset-x-0 bottom-0 h-1 bg-current opacity-60 ${
                    paused ? 'is-paused' : ''
                  } ${ACCENTS[t.type]}`}
                  style={{ '--toast-duration': `${t.duration}ms` } as CSSProperties}
                />
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
