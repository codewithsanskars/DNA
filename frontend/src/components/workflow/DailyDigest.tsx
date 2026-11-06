import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { digestApi, DigestScope, DigestSection, DigestTone } from '../../api/digest.api';
import { queryKeys } from '../../api/queryKeys';
import Icon, { IconName } from '../shared/Icon';
import Button from '../shared/Button';
import { timeAgo } from '../../utils/format';

const SCOPE_KEY = 'swfs_digest_scope';

const TONE_DOT: Record<DigestTone, string> = {
  danger: 'bg-rose-500',
  warning: 'bg-amber-500',
  info: 'bg-sky-500',
  success: 'bg-emerald-500',
  neutral: 'bg-zinc-400',
};

const SECTION_ICON: Record<string, IconName> = {
  feedbackMissing: 'edit',
  tasks: 'check-square',
  interviewsToday: 'calendar',
  awaitingClient: 'clock',
  rolesAtRisk: 'alert',
  stale: 'repeat',
  followUps: 'phone',
  newRoles: 'briefcase',
  wins: 'award',
};

function readScope(): DigestScope {
  try {
    return localStorage.getItem(SCOPE_KEY) === 'team' ? 'team' : 'mine';
  } catch {
    return 'mine';
  }
}

/**
 * Daily recruiter digest (My Work). Deterministic sections from the API, plus
 * "Today's focus", the top 3 actions picked by AI from those same items
 * (rule-based if AI is offline). The daily notification links here (#digest).
 */
export default function DailyDigest() {
  const queryClient = useQueryClient();
  const ref = useRef<HTMLElement>(null);
  const [scope, setScopeState] = useState<DigestScope>(readScope);
  const [refreshing, setRefreshing] = useState(false);
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});

  const setScope = (s: DigestScope) => {
    setScopeState(s);
    try {
      localStorage.setItem(SCOPE_KEY, s);
    } catch {
      /* per-browser convenience only */
    }
  };

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.digest(scope),
    queryFn: () => digestApi.get(scope),
    staleTime: 5 * 60_000,
  });

  // Arriving from the daily notification: bring the digest into view.
  useEffect(() => {
    if (window.location.hash === '#digest') ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [data]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const fresh = await digestApi.get(scope, true);
      queryClient.setQueryData(queryKeys.digest(scope), fresh);
    } finally {
      setRefreshing(false);
    }
  };

  const sections = (data?.sections ?? []).filter((s) => s.items.length);

  return (
    <section id="digest" ref={ref} className="scroll-mt-4 overflow-hidden rounded-lg border border-border bg-card shadow-xs">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-gradient-to-br from-brand-subtle/60 to-transparent px-4 py-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-brand-text">
            <Icon name="sparkles" size={12} /> Daily digest
            {data && <span className="font-normal normal-case tracking-normal text-subtle-foreground">· {new Date(data.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>}
          </p>
          {isLoading ? (
            <div className="mt-2 h-5 w-64 animate-pulse rounded bg-muted" />
          ) : data ? (
            <>
              <h2 className="mt-1 text-[17px] font-semibold tracking-tight text-foreground">{data.greeting}</h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{data.headline}</p>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border bg-card p-0.5" role="group" aria-label="Digest scope">
            {(
              [
                ['mine', 'Mine'],
                ['team', 'Team'],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                aria-pressed={scope === k}
                onClick={() => setScope(k)}
                className={`rounded px-2.5 py-1 text-xs font-medium ${scope === k ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {l}
              </button>
            ))}
          </div>
          <Button size="sm" variant="ghost" icon="repeat" loading={refreshing} onClick={refresh} aria-label="Refresh digest" />
        </div>
      </header>

      {error ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">Couldn’t load the digest. Try refreshing.</p>
      ) : isLoading ? (
        <div className="grid gap-2 p-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : data ? (
        <div className="space-y-4 p-4">
          {/* Today's focus */}
          {data.focus.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle-foreground">
                Today’s focus
                <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium normal-case tracking-normal text-muted-foreground">
                  {data.focusSource === 'ai' ? 'ranked by AI' : 'by urgency'}
                </span>
              </p>
              <ol className="grid gap-2 sm:grid-cols-3">
                {data.focus.map((f, i) => (
                  <li key={f.ref}>
                    <Link
                      to={f.link}
                      className="group flex h-full gap-2.5 rounded-md border border-border p-3 transition-colors hover:border-brand/40 hover:bg-brand-subtle/30"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-white">{i + 1}</span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium leading-snug text-foreground">{f.title}</span>
                        {f.why && <span className="mt-0.5 block text-xs text-muted-foreground">{f.why}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Count strip */}
          <div className="flex flex-wrap gap-1.5">
            {data.sections.map((s) => (
              <a
                key={s.key}
                href={`#digest-${s.key}`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                  s.items.length ? 'border-border text-foreground hover:bg-muted' : 'pointer-events-none border-transparent text-subtle-foreground'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${s.items.length ? TONE_DOT[s.tone] : 'bg-border'}`} />
                {s.title}
                <span className="font-semibold tabular-nums">{s.items.length}</span>
              </a>
            ))}
          </div>

          {/* Sections */}
          {sections.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-4 py-8 text-center">
              <Icon name="check" size={20} className="mx-auto text-emerald-600" />
              <p className="mt-2 text-sm font-medium text-foreground">You’re all caught up</p>
              <p className="mt-1 text-xs text-muted-foreground">Nothing is overdue or stuck. A good day to source for open roles.</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {sections.map((s) => (
                <SectionCard key={s.key} s={s} expanded={!!showAll[s.key]} onToggle={() => setShowAll((p) => ({ ...p, [s.key]: !p[s.key] }))} />
              ))}
            </div>
          )}

          <p className="text-2xs text-subtle-foreground">
            Updated {timeAgo(data.generatedAt)} · {scope === 'mine' ? 'roles and candidates you own, and tasks assigned to you' : 'the whole team'}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function SectionCard({ s, expanded, onToggle }: { s: DigestSection; expanded: boolean; onToggle: () => void }) {
  const visible = expanded ? s.items : s.items.slice(0, 4);
  return (
    <div id={`digest-${s.key}`} className="scroll-mt-4 rounded-md border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[s.tone]}`} />
          <Icon name={SECTION_ICON[s.key] ?? 'list'} size={13} className="text-muted-foreground" />
          {s.title}
        </p>
        <span className="text-xs tabular-nums text-subtle-foreground">{s.items.length}</span>
      </div>
      <ul className="divide-y divide-border">
        {visible.map((it) => (
          <li key={it.id}>
            <Link to={it.link} className="block px-3 py-2 transition-colors hover:bg-muted/60">
              <span className="block truncate text-[13px] font-medium text-foreground">{it.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{it.detail}</span>
            </Link>
          </li>
        ))}
      </ul>
      {s.items.length > 4 && (
        <button type="button" onClick={onToggle} className="w-full border-t border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
          {expanded ? 'Show less' : `Show all ${s.items.length}`}
        </button>
      )}
    </div>
  );
}
