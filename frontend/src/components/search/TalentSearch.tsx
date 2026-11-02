import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { AiSearchBar } from '../ai/AiWidgets';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { candidateApi } from '../../api/candidate.api';
import { workflowApi } from '../../api/workflow.api';
import { queryKeys } from '../../api/queryKeys';
import { useJobs } from '../../hooks/useJobs';
import { useStaff } from '../../hooks/useWorkflow';
import { CandidateSource, CandidateStage, GlobalStatus, WorkAuthorization } from '../../types';
import { SOURCE_LABELS, WORK_AUTH_LABELS, daysUntil, formatDay, formatMoney } from '../../utils/labels';
import { humanize, timeAgo } from '../../utils/format';
import { errorMessage } from '../../utils/errors';
import { exportCandidatesCsv } from '../../utils/exportCandidates';
import CandidateAvatar from '../candidates/CandidateAvatar';
import BulkActionBar from '../candidates/BulkActionBar';
import Button from '../shared/Button';
import Badge, { GlobalStatusBadge } from '../shared/Badge';
import Icon from '../shared/Icon';
import { Input, Select } from '../shared/Field';
import { useToast } from '../shared/Toast';

/** Every filter the search endpoint understands — all live in the URL (AT-07). */
const FILTER_KEYS = [
  'q',
  'skills',
  'title',
  'company',
  'location',
  'education',
  'minExperience',
  'maxExperience',
  'maxExpectedCtc',
  'maxNoticePeriod',
  'availableBy',
  'workAuthorization',
  'globalStatus',
  'source',
  'tags',
  'owner',
  'jobId',
  'stage',
  'matchJobId',
  'minMatch',
] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const STATUSES: GlobalStatus[] = ['OPEN', 'SELECTED', 'ONBOARDED', 'ARCHIVED'];
const STAGES: CandidateStage[] = ['APPLIED', 'SCREENING', 'SUBMITTED', 'SHORTLISTED', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'];
const SORTS = [
  ['recent', 'Newest'],
  ['updated', 'Recently updated'],
  ['name', 'Name'],
  ['experience', 'Most experienced'],
  ['available', 'Soonest available'],
  ['lastContacted', 'Least recently contacted'],
] as const;

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle-foreground">{label}</p>
      {children}
    </div>
  );
}

/** Toggle chips for a comma-joined multi-value URL param. */
function Chips<T extends string>({ options, value, onChange, label }: { options: T[]; value: string; onChange: (v: string) => void; label: (o: T) => string }) {
  const set = new Set(value ? value.split(',') : []);
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => {
        const on = set.has(o);
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            onClick={() => {
              const next = new Set(set);
              if (on) next.delete(o);
              else next.add(o);
              onChange([...next].join(','));
            }}
            className={`rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ring-inset transition-colors ${
              on ? 'bg-brand-subtle text-brand-text ring-brand/30' : 'text-muted-foreground ring-border hover:text-foreground'
            }`}
          >
            {label(o)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Database talent search (RC-21..RC-23, RC-25): boolean keyword query plus
 * structured filters over the whole candidate pool, server-side paginated,
 * with saved searches and bulk actions on the results. SWFS staff only.
 */
export default function TalentSearch() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { data: jobs = [] } = useJobs();
  const { data: staff = [] } = useStaff();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [qDraft, setQDraft] = useState(params.get('q') ?? '');
  const [showHelp, setShowHelp] = useState(false);

  const get = (k: FilterKey) => params.get(k) ?? '';
  const page = Number(params.get('page') || 1);
  const sort = params.get('sort') || 'recent';

  const setParam = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in updates)) next.delete('page');
    setParams(next, { replace: true });
    setSelected(new Set());
  };

  useEffect(() => setQDraft(params.get('q') ?? ''), [params]);

  const searchParams = useMemo(() => {
    const out: Record<string, string> = { page: String(page), pageSize: '25', sort };
    for (const k of FILTER_KEYS) if (params.get(k)) out[k] = params.get(k)!;
    return out;
  }, [params, page, sort]);
  const activeFilters = FILTER_KEYS.filter((k) => params.get(k));

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: queryKeys.candidateSearch(searchParams),
    queryFn: () => candidateApi.search(searchParams),
    placeholderData: keepPreviousData,
  });
  const { data: tags = [] } = useQuery({ queryKey: queryKeys.candidateTags, queryFn: candidateApi.getTags });
  const { data: saved = [] } = useQuery({ queryKey: queryKeys.savedSearches, queryFn: workflowApi.getSavedSearches });

  const saveSearch = useMutation({
    mutationFn: (name: string) => {
      const p: Record<string, string> = { sort };
      for (const k of FILTER_KEYS) if (params.get(k)) p[k] = params.get(k)!;
      return workflowApi.createSavedSearch(name, p);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.savedSearches });
      toast.success('Search saved');
    },
    onError: (err) => toast.error('Couldn’t save the search', errorMessage(err, 'Please try again.')),
  });
  const deleteSaved = useMutation({
    mutationFn: workflowApi.deleteSavedSearch,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.savedSearches }),
  });

  const submitQuery = (e: FormEvent) => {
    e.preventDefault();
    setParam({ q: qDraft.trim() || null });
  };

  const items = data?.items ?? [];
  const matchJob = data?.matchJob;
  const [exporting, setExporting] = useState(false);
  // Export every filtered result (all pages), not just the visible one.
  const exportAll = async () => {
    setExporting(true);
    try {
      const { page: _p, pageSize: _s, ...filters } = searchParams;
      const all = await candidateApi.searchAll(filters);
      exportCandidatesCsv(all, true, matchJob ? `match-${matchJob.title.replace(/\W+/g, '-').toLowerCase()}` : 'search-results');
    } catch (err) {
      toast.error('Couldn’t export', errorMessage(err, 'Please try again.'));
    } finally {
      setExporting(false);
    }
  };
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const allSelected = items.length > 0 && items.every((c) => selected.has(c._id));

  const text = (k: FilterKey, placeholder: string, type = 'text') => (
    <Input
      key={`${k}-${get(k)}`}
      type={type}
      defaultValue={get(k)}
      placeholder={placeholder}
      onBlur={(e) => e.target.value !== get(k) && setParam({ [k]: e.target.value.trim() || null })}
      onKeyDown={(e) => e.key === 'Enter' && setParam({ [k]: (e.target as HTMLInputElement).value.trim() || null })}
      className="!h-8 !text-xs"
    />
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      {/* Filters */}
      <aside className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
        <FilterGroup label="Match to a role's JD">
          <Select
            value={get('matchJobId')}
            onChange={(e) => setParam({ matchJobId: e.target.value || null, minMatch: e.target.value ? get('minMatch') || null : null })}
            className="!h-8 !text-xs"
            aria-label="Match to role"
          >
            <option value="">No JD match</option>
            {jobs
              .filter((j) => j.status === 'OPEN')
              .map((j) => (
                <option key={j._id} value={j._id}>
                  {j.title}
                </option>
              ))}
          </Select>
          {get('matchJobId') && (
            <div className="mt-2">
              <Chips
                options={['50', '60', '75'] as const as unknown as ('50' | '60' | '75')[]}
                value={get('minMatch')}
                onChange={(v) => setParam({ minMatch: v ? v.split(',').pop()! : null })}
                label={(o) => `${o}%+`}
              />
            </div>
          )}
        </FilterGroup>
        {saved.length > 0 && (
          <FilterGroup label="Saved searches">
            <ul className="space-y-0.5">
              {saved.map((s) => (
                <li key={s.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setParams(new URLSearchParams(s.params), { replace: true })}
                    className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs text-foreground hover:bg-muted"
                  >
                    <Icon name="bookmark" size={12} className="shrink-0 text-subtle-foreground" />
                    <span className="truncate">{s.name}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete saved search ${s.name}`}
                    onClick={() => deleteSaved.mutate(s.id)}
                    className="rounded p-1 text-subtle-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
                  >
                    <Icon name="close" size={11} />
                  </button>
                </li>
              ))}
            </ul>
          </FilterGroup>
        )}
        <FilterGroup label="Skills (all of)">{text('skills', 'react, node')}</FilterGroup>
        <FilterGroup label="Title">{text('title', 'e.g. backend engineer')}</FilterGroup>
        <FilterGroup label="Company (current or past)">{text('company', 'e.g. Google')}</FilterGroup>
        <FilterGroup label="Location">{text('location', 'e.g. Austin')}</FilterGroup>
        <FilterGroup label="Experience (years)">
          <div className="flex gap-2">
            {text('minExperience', 'min', 'number')}
            {text('maxExperience', 'max', 'number')}
          </div>
        </FilterGroup>
        <FilterGroup label="Max expected CTC">{text('maxExpectedCtc', 'e.g. 150000', 'number')}</FilterGroup>
        <FilterGroup label="Max notice period (days)">{text('maxNoticePeriod', 'e.g. 30', 'number')}</FilterGroup>
        <FilterGroup label="Available by">{text('availableBy', '', 'date')}</FilterGroup>
        <FilterGroup label="Education">{text('education', 'school, degree or field')}</FilterGroup>
        <FilterGroup label="Status">
          <Chips options={STATUSES} value={get('globalStatus')} onChange={(v) => setParam({ globalStatus: v || null })} label={humanize} />
        </FilterGroup>
        <FilterGroup label="Work authorization">
          <Chips
            options={Object.keys(WORK_AUTH_LABELS) as WorkAuthorization[]}
            value={get('workAuthorization')}
            onChange={(v) => setParam({ workAuthorization: v || null })}
            label={(o) => WORK_AUTH_LABELS[o].split(' /')[0]}
          />
        </FilterGroup>
        <FilterGroup label="Source">
          <Chips
            options={Object.keys(SOURCE_LABELS) as CandidateSource[]}
            value={get('source')}
            onChange={(v) => setParam({ source: v || null })}
            label={(o) => SOURCE_LABELS[o]}
          />
        </FilterGroup>
        {tags.length > 0 && (
          <FilterGroup label="Tags (all of)">
            <Chips options={tags.slice(0, 30).map((t) => t.tag)} value={get('tags')} onChange={(v) => setParam({ tags: v || null })} label={(t) => t} />
          </FilterGroup>
        )}
        <FilterGroup label="Owner">
          <Select value={get('owner')} onChange={(e) => setParam({ owner: e.target.value || null })} className="!h-8 !text-xs">
            <option value="">Anyone</option>
            <option value="me">Me</option>
            <option value="none">Unassigned</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </FilterGroup>
        <FilterGroup label="In pipeline for">
          <Select value={get('jobId')} onChange={(e) => setParam({ jobId: e.target.value || null })} className="!h-8 !text-xs">
            <option value="">Any role</option>
            {jobs.map((j) => (
              <option key={j._id} value={j._id}>
                {j.title}
              </option>
            ))}
          </Select>
          <div className="mt-2">
            <Chips options={STAGES} value={get('stage')} onChange={(v) => setParam({ stage: v || null })} label={humanize} />
          </div>
        </FilterGroup>
      </aside>

      {/* Results */}
      <div className="min-w-0 space-y-3">
        <AiSearchBar
          onApply={(filters) => {
            const next = new URLSearchParams();
            if (sort !== 'recent') next.set('sort', sort);
            for (const [k, v] of Object.entries(filters)) if ((FILTER_KEYS as readonly string[]).includes(k) && v) next.set(k, v);
            setParams(next, { replace: true });
            setSelected(new Set());
          }}
        />
        <form onSubmit={submitQuery} className="flex gap-2">
          <div className="relative flex-1">
            <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle-foreground" />
            <Input
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              placeholder='Boolean search, e.g.  python AND (aws OR gcp) NOT intern "data engineer"'
              className="!pl-9"
              aria-label="Keyword search"
            />
          </div>
          <Button type="submit" variant="primary">
            Search
          </Button>
          <Button type="button" variant="ghost" icon="alert" aria-label="Search syntax help" onClick={() => setShowHelp((v) => !v)} />
        </form>
        {showHelp && (
          <div className="rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
            Searches name, email, title, company, location, skills, tags, languages, notes, employment history, education and certifications.
            Use <code className="text-foreground">AND</code>, <code className="text-foreground">OR</code>, <code className="text-foreground">NOT</code> (or{' '}
            <code className="text-foreground">-word</code>), <code className="text-foreground">"exact phrase"</code> and parentheses. Words next to each other are ANDed.
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] text-muted-foreground">
            {data ? (
              <>
                <span className="font-semibold text-foreground">{data.total.toLocaleString()}</span> candidate{data.total === 1 ? '' : 's'}
              </>
            ) : (
              'Searching…'
            )}
            {activeFilters.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setParams(new URLSearchParams(), { replace: true });
                  setQDraft('');
                }}
                className="ml-2 text-xs font-medium text-brand-text hover:underline"
              >
                Clear {activeFilters.length} filter{activeFilters.length === 1 ? '' : 's'}
              </button>
            )}
          </p>
          <div className="flex items-center gap-2">
            {matchJob ? (
              <span className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs text-muted-foreground">
                <Icon name="sparkles" size={12} className="text-brand-text" /> Sorted by JD match
              </span>
            ) : (
              <Select value={sort} onChange={(e) => setParam({ sort: e.target.value === 'recent' ? null : e.target.value })} className="!h-8 !w-48 !text-xs" aria-label="Sort">
                {SORTS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
            <Button
              size="sm"
              variant="ghost"
              icon="bookmark"
              disabled={!activeFilters.length}
              onClick={() => {
                const name = window.prompt('Name this search');
                if (name?.trim()) saveSearch.mutate(name.trim());
              }}
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" icon="download" disabled={!items.length} loading={exporting} onClick={exportAll}>
              Export all{data ? ` (${Math.min(data.total, 5000).toLocaleString()})` : ''}
            </Button>
          </div>
        </div>

        {matchJob && (
          <div className="rounded-md border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Matching against “{matchJob.title}”</span>
            {matchJob.requirements.mustHaveSkills.length > 0 && <> · must-haves: {matchJob.requirements.mustHaveSkills.join(', ')}</>}
            {matchJob.requirements.minYears != null && <> · {matchJob.requirements.minYears}+ yrs</>}
            {matchJob.requirements.method === 'keywords' && <> · <span className="text-amber-700 dark:text-amber-300">keyword mode (AI was unavailable when this role was analysed)</span></>}
          </div>
        )}

        {selected.size > 0 && <BulkActionBar selected={items.filter((c) => selected.has(c._id))} jobs={jobs} onClear={() => setSelected(new Set())} />}

        <div className={`overflow-hidden rounded-lg border border-border bg-card shadow-xs transition-opacity ${isFetching ? 'opacity-70' : ''}`}>
          {error ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">{errorMessage(error, 'Search failed.')}</p>
          ) : isLoading ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">Searching…</p>
          ) : items.length === 0 ? (
            <div className="px-4 py-14 text-center">
              <Icon name="search" size={22} className="mx-auto text-subtle-foreground" />
              <p className="mt-3 text-sm font-medium text-foreground">No candidates match</p>
              <p className="mt-1 text-xs text-muted-foreground">Try fewer filters or broaden the keyword query.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              <li className="flex items-center gap-3 bg-muted px-4 py-2">
                <input
                  type="checkbox"
                  aria-label="Select page"
                  checked={allSelected}
                  onChange={(e) => setSelected(e.target.checked ? new Set(items.map((c) => c._id)) : new Set())}
                  className="h-4 w-4 cursor-pointer accent-[#D40000]"
                />
                <span className="text-2xs font-semibold uppercase tracking-wider text-subtle-foreground">Candidate</span>
              </li>
              {items.map((c) => {
                const available = c.availableFrom ? (daysUntil(c.availableFrom) <= 0 ? 'Available now' : `Available ${formatDay(c.availableFrom)}`) : null;
                return (
                  <li key={c._id} className="flex cursor-pointer gap-3 px-4 py-3 transition-colors hover:bg-muted/60" onClick={() => navigate(`/candidates/${c._id}`)}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${c.firstName} ${c.lastName}`}
                      checked={selected.has(c._id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(c._id);
                          else next.delete(c._id);
                          return next;
                        })
                      }
                      className="mt-2.5 h-4 w-4 shrink-0 cursor-pointer accent-[#D40000]"
                    />
                    <CandidateAvatar candidateId={c._id} name={c.firstName} photoUrl={c.photoUrl} version={c.syncedAt} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13px] font-semibold text-foreground">
                          {c.firstName} {c.lastName}
                        </p>
                        {c.match && (
                          <Badge
                            tone={c.match.score >= 80 ? 'success' : c.match.score >= 60 ? 'info' : c.match.score >= 45 ? 'warning' : 'neutral'}
                            className="tabular-nums"
                          >
                            {c.match.score}% match
                          </Badge>
                        )}
                        <GlobalStatusBadge status={c.globalStatus} />
                        {(c.tags ?? []).slice(0, 3).map((t) => (
                          <Badge key={t} tone="purple">
                            {t}
                          </Badge>
                        ))}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {[c.currentTitle, c.currentCompany].filter(Boolean).join(' · ') || '—'}
                        {c.location && ` · ${c.location}`}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-2xs text-subtle-foreground">
                        {c.yearsExperience != null && <span>{c.yearsExperience} yrs exp</span>}
                        {c.expectedCtc != null && <span>Expects {formatMoney(c.expectedCtc, c.ctcCurrency)}</span>}
                        {available && <span>{available}</span>}
                        {c.noticePeriod != null && !c.availableFrom && <span>{c.noticePeriod}d notice</span>}
                        {c.workAuthorization && <span>{WORK_AUTH_LABELS[c.workAuthorization]}</span>}
                        {c.owner && <span>Owner: {c.owner.name}</span>}
                        <span>{c.lastContactedAt ? `Contacted ${timeAgo(c.lastContactedAt)}` : 'Never contacted'}</span>
                      </div>
                      {c.match && (c.match.matchedSkills.length > 0 || c.match.missingSkills.length > 0) && (
                        <p className="mt-1 text-2xs text-muted-foreground">
                          {c.match.matchedSkills.length > 0 && <span className="text-emerald-700 dark:text-emerald-400">✓ {c.match.matchedSkills.join(', ')}</span>}
                          {c.match.matchedSkills.length > 0 && c.match.missingSkills.length > 0 && '  ·  '}
                          {c.match.missingSkills.length > 0 && <span>Missing: {c.match.missingSkills.join(', ')}</span>}
                        </p>
                      )}
                      {c.skills.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {c.skills.slice(0, 8).map((s) => (
                            <span key={s} className="rounded bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground ring-1 ring-inset ring-border">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="hidden shrink-0 text-right text-2xs text-subtle-foreground sm:block">
                      {c.jobLinks.length > 0 ? `${c.jobLinks.length} role${c.jobLinks.length === 1 ? '' : 's'}` : 'Not in a pipeline'}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {data && totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-1">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })}>
                Previous
              </Button>
              <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setParam({ page: String(page + 1) })}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
