import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useJobs } from '../../hooks/useJobs';
import { candidateApi } from '../../api/candidate.api';
import { organizationApi } from '../../api/organization.api';
import { queryKeys } from '../../api/queryKeys';
import { isAdminRole } from '../../utils/roles';
import Icon, { IconName } from '../shared/Icon';

interface Command {
  id: string;
  group: 'Navigate' | 'Actions' | 'Candidates' | 'Roles' | 'Clients';
  label: string;
  hint?: string;
  icon: IconName;
  run: () => void;
  keywords?: string;
}

/** Subsequence fuzzy score — every query char must appear in order. */
function score(text: string, q: string): number {
  if (!q) return 1;
  const t = text.toLowerCase();
  const idx = t.indexOf(q);
  if (idx >= 0) return 100 - idx;
  let ti = 0;
  for (const ch of q) {
    ti = t.indexOf(ch, ti);
    if (ti < 0) return 0;
    ti++;
  }
  return 10;
}

/**
 * ⌘K / Ctrl+K command palette (RC-26 / AT-31): jump to any candidate, role
 * or client in scope, or run a navigation / quick action — keyboard only.
 * Clients only ever see their own org's records (the list APIs are scoped).
 */
export default function CommandPalette() {
  const { user } = useAuth();
  const { toggleTheme } = useTheme();
  const navigate = useNavigate();
  const admin = isAdminRole(user?.role);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === '/' && !open && !/input|textarea|select/i.test((e.target as HTMLElement)?.tagName) && !(e.target as HTMLElement)?.isContentEditable) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('swfs:open-command-palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('swfs:open-command-palette', onOpen);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Only fetch records once the palette has been opened.
  // Candidates are searched server-side (debounced) rather than loading the
  // whole pool; roles and clients are small enough to filter locally.
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);
  const { data: candidatePage } = useQuery({
    queryKey: queryKeys.candidateList({ q: debounced, pageSize: 8, palette: true }),
    queryFn: () => candidateApi.list({ q: debounced, pageSize: 8 }),
    enabled: open && debounced.length >= 2,
    staleTime: 30_000,
  });
  const candidates = debounced.length >= 2 ? candidatePage?.items ?? [] : [];
  const { data: jobs = [] } = useJobs(open);
  const { data: orgs = [] } = useQuery({
    queryKey: queryKeys.organizations,
    queryFn: organizationApi.getOrganizations,
    enabled: open && admin,
  });

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => navigate(to);
    const nav: Command[] = [
      { id: 'n-dash', group: 'Navigate', label: 'Dashboard', icon: 'dashboard', run: go('/dashboard') },
      { id: 'n-jobs', group: 'Navigate', label: 'Open roles', icon: 'briefcase', run: go('/jobs') },
      { id: 'n-cand', group: 'Navigate', label: 'Candidates', icon: 'users', run: go('/candidates') },
      ...(admin
        ? ([
            { id: 'n-work', group: 'Navigate', label: 'My work', icon: 'check-square', run: go('/my-work'), keywords: 'tasks todo' },
            { id: 'n-search', group: 'Navigate', label: 'Search talent database', icon: 'search', run: go('/search') },
            { id: 'n-li', group: 'Navigate', label: 'LinkedIn sourcing', icon: 'linkedin', run: go('/search?tab=linkedin') },
            { id: 'n-master', group: 'Navigate', label: 'Master database', icon: 'inbox', run: go('/master-database') },
            { id: 'n-orgs', group: 'Navigate', label: 'Organizations', icon: 'building', run: go('/organization') },
          ] as Command[])
        : []),
      { id: 'n-notif', group: 'Navigate', label: 'Notifications', icon: 'bell', run: go('/notifications') },
      { id: 'n-act', group: 'Navigate', label: 'Activity log', icon: 'activity', run: go('/activity') },
      { id: 'n-set', group: 'Navigate', label: 'Settings', icon: 'settings', run: go('/settings') },
      { id: 'a-theme', group: 'Actions', label: 'Toggle dark mode', icon: 'moon', run: toggleTheme, keywords: 'theme light' },
    ];
    const recs: Command[] = [
      ...candidates.map((c) => ({
        id: `c-${c._id}`,
        group: 'Candidates' as const,
        label: `${c.firstName} ${c.lastName}`,
        hint: [c.currentTitle, c.currentCompany].filter(Boolean).join(' · '),
        icon: 'users' as IconName,
        keywords: `${c.email ?? ''} ${c.skills.join(' ')} ${(c.tags ?? []).join(' ')}`,
        run: go(`/candidates/${c._id}`),
      })),
      ...jobs.map((j) => ({
        id: `j-${j._id}`,
        group: 'Roles' as const,
        label: j.title,
        hint: [j.department, j.location].filter(Boolean).join(' · '),
        icon: 'briefcase' as IconName,
        run: go(`/jobs/${j._id}`),
      })),
      ...orgs.map((o) => ({
        id: `o-${o._id}`,
        group: 'Clients' as const,
        label: o.name,
        hint: o.industry,
        icon: 'building' as IconName,
        run: go(`/organization/${o._id}`),
      })),
    ];
    return [...nav, ...recs];
  }, [admin, candidates, jobs, orgs, navigate, toggleTheme]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.filter((c) => c.group === 'Navigate' || c.group === 'Actions');
    const scored = commands
      .map((c) => ({
        c,
        s: Math.max(score(c.label, q), score(`${c.hint ?? ''} ${c.keywords ?? ''}`, q) / 2, c.group === 'Candidates' ? 5 : 0),
      }))
      .filter((x) => x.s > 0);
    // Keep each group contiguous (one header per group), groups ordered by
    // their best match, items by score, capped per group.
    const groups = new Map<Command['group'], typeof scored>();
    for (const x of scored) groups.set(x.c.group, [...(groups.get(x.c.group) ?? []), x]);
    return [...groups.values()]
      .map((g) => g.sort((a, b) => b.s - a.s).slice(0, 8))
      .sort((a, b) => b[0].s - a[0].s)
      .flat()
      .map((x) => x.c);
  }, [commands, query]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const runAt = (i: number) => {
    const cmd = results[i];
    if (!cmd) return;
    setOpen(false);
    cmd.run();
  };

  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-[12vh] animate-fade-in" onClick={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-card shadow-lg animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Icon name="search" size={16} className="text-subtle-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                runAt(active);
              } else if (e.key === 'Escape') setOpen(false);
            }}
            placeholder={admin ? 'Search candidates, roles, clients or jump to…' : 'Search candidates and roles, or jump to…'}
            className="h-12 flex-1 bg-transparent text-sm text-foreground placeholder:text-subtle-foreground focus:outline-none"
            aria-label="Command"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-2xs text-subtle-foreground">Esc</kbd>
        </div>
        <ul ref={listRef} className="max-h-[50vh] overflow-y-auto py-1" role="listbox">
          {results.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted-foreground">No matches</li>}
          {results.map((cmd, i) => {
            const header = cmd.group !== lastGroup ? cmd.group : null;
            lastGroup = cmd.group;
            return (
              <li key={cmd.id}>
                {header && <p className="px-4 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wider text-subtle-foreground">{header}</p>}
                <button
                  type="button"
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={() => runAt(i)}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left ${i === active ? 'bg-muted' : ''}`}
                >
                  <Icon name={cmd.icon} size={15} className="shrink-0 text-subtle-foreground" />
                  <span className="truncate text-[13px] text-foreground">{cmd.label}</span>
                  {cmd.hint && <span className="truncate text-xs text-subtle-foreground">{cmd.hint}</span>}
                  {i === active && <Icon name="arrow-right" size={13} className="ml-auto shrink-0 text-subtle-foreground" />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-3 border-t border-border bg-muted px-4 py-2 text-2xs text-subtle-foreground">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span className="ml-auto">⌘K / Ctrl K · / to open</span>
        </div>
      </div>
    </div>
  );
}
