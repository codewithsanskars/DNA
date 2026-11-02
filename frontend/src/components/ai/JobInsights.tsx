import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { aiApi } from '../../api/ai.api';
import { queryKeys } from '../../api/queryKeys';
import { errorMessage } from '../../utils/errors';
import { timeAgo } from '../../utils/format';
import { useToast } from '../shared/Toast';
import Button from '../shared/Button';
import Icon from '../shared/Icon';
import Badge from '../shared/Badge';

const MATCH_THRESHOLD = 60;
const matchesUrl = (jobId: string, min = MATCH_THRESHOLD) => `/search?tab=database&matchJobId=${jobId}&minMatch=${min}`;

function SkillChips({ must, nice = [] }: { must: string[]; nice?: string[] }) {
  if (!must.length && !nice.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {must.map((s) => (
        <span key={`m-${s}`} className="rounded bg-card px-1.5 py-0.5 text-2xs font-medium text-foreground ring-1 ring-inset ring-border">
          {s}
        </span>
      ))}
      {nice.map((s) => (
        <span key={`n-${s}`} className="rounded px-1.5 py-0.5 text-2xs text-muted-foreground ring-1 ring-inset ring-border" title="Nice to have">
          {s}
        </span>
      ))}
    </div>
  );
}

/**
 * Role details › AI summary and extracted requirements (both roles). The pool
 * match count and "See matches" are SWFS-only; the server omits them for clients.
 */
export function JobAiInsights({ jobId, isAdmin }: { jobId: string; isAdmin: boolean }) {
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: queryKeys.jobInsights(jobId), queryFn: () => aiApi.jobInsights(jobId), staleTime: 60_000 });
  const reanalyze = useMutation({
    mutationFn: () => aiApi.analyzeJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jobInsights(jobId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.newOpenings });
      toast.success('Role re-analysed');
    },
    onError: (err) => toast.error('Couldn’t analyse the role', errorMessage(err, 'Please try again.')),
  });

  if (q.isLoading) return <div className="h-20 animate-pulse rounded-lg bg-muted" />;
  if (q.error || !q.data) return null;
  const d = q.data;
  const req = d.requirements;

  return (
    <div className="rounded-lg border border-border bg-brand-subtle/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
          <Icon name="sparkles" size={14} className="text-brand-text" /> AI summary
        </p>
        <Button size="sm" variant="ghost" icon="repeat" loading={reanalyze.isPending} onClick={() => reanalyze.mutate()}>
          Re-analyse
        </Button>
      </div>
      {d.summary ? (
        <p className="mt-1.5 text-[13px] leading-relaxed text-foreground">{d.summary}</p>
      ) : (
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          {d.analyzedAt
            ? 'AI was unavailable when this role was analysed, so requirements were read from keywords. Re-analyse once AI is back.'
            : 'Not analysed yet.'}
        </p>
      )}
      {req && <SkillChips must={req.mustHaveSkills} nice={req.niceToHaveSkills} />}
      {req?.minYears != null && <p className="mt-1.5 text-2xs text-muted-foreground">{req.minYears}+ years experience</p>}
      {isAdmin && d.matchCount != null && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <p className="text-[13px] text-foreground">
            <span className="text-lg font-semibold tabular-nums">{d.matchCount}</span> pool candidate{d.matchCount === 1 ? '' : 's'} match
            this JD
            <span className="text-muted-foreground">
              {' '}
              ({d.strongCount} strong · {d.poolSize} reviewed)
            </span>
          </p>
          <Button size="sm" variant="primary" iconRight="arrow-right" onClick={() => navigate(matchesUrl(jobId, d.threshold))}>
            See matches
          </Button>
        </div>
      )}
    </div>
  );
}

/** SWFS dashboard: roles opened recently, each with its AI summary and how many pool candidates match. */
export function NewOpeningsCard() {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: queryKeys.newOpenings, queryFn: () => aiApi.newOpenings(14), staleTime: 5 * 60_000 });
  if (q.isLoading) return <div className="h-32 animate-pulse rounded-lg border border-border bg-muted" />;
  if (q.error || !q.data?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <Icon name="sparkles" size={14} className="text-brand-text" />
          New openings
          <Badge tone="brand">{q.data.length}</Badge>
        </h3>
        <span className="text-2xs text-subtle-foreground">Last 14 days · a match is {MATCH_THRESHOLD}%+ JD fit</span>
      </div>
      <ul className="grid md:grid-cols-2">
        {q.data.map((o) => (
          <li key={o.id} className="border-b border-border p-4 md:odd:border-r">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-foreground">{o.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[o.organizationName, o.location, `opened ${timeAgo(o.openedAt)}`].filter(Boolean).join(' · ')}
                </p>
              </div>
              {(o.priority === 'HIGH' || (o.priority as string) === 'URGENT') && <Badge tone="danger">{o.priority.toLowerCase()}</Badge>}
            </div>
            {o.summary && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-foreground">{o.summary}</p>}
            <SkillChips must={o.mustHaveSkills} />
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {o.matchCount == null ? (
                  'Analysing…'
                ) : (
                  <>
                    <span className="font-semibold tabular-nums text-foreground">{o.matchCount}</span> matching
                    {o.strongCount ? ` · ${o.strongCount} strong` : ''} · {o.totalCandidates} in pipeline
                  </>
                )}
              </p>
              <Button size="sm" variant="ghost" iconRight="arrow-right" onClick={() => navigate(matchesUrl(o.id))}>
                View matches
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
