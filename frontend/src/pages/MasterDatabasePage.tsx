import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import AppLayout from '../components/layout/AppLayout';
import Badge, { StageBadge, GlobalStatusBadge, CandidateStatusBadge } from '../components/shared/Badge';
import Avatar from '../components/shared/Avatar';
import Icon from '../components/shared/Icon';
import { TableShell, Thead, Th, Tr, Td, EmptyRow } from '../components/shared/Table';
import { TableSkeleton } from '../components/shared/States';
import { Input } from '../components/shared/Field';
import Pagination, { PAGE_SIZE } from '../components/shared/Pagination';
import { candidateApi } from '../api/candidate.api';
import { queryKeys } from '../api/queryKeys';
import { Candidate } from '../types';

// The pool (OPEN, plus ARCHIVED as Opportunity / Contacted / Not interested)
// is filtered server-side — see `masterPool` in candidate.repository.ts.

export default function MasterDatabasePage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const q = params.get('q') ?? '';
  const [qDraft, setQDraft] = useState(q);
  const listParams = { masterPool: true, q: q || undefined, page, pageSize: PAGE_SIZE };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: queryKeys.candidateList(listParams),
    queryFn: () => candidateApi.list(listParams),
    placeholderData: keepPreviousData,
  });
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const clientNames = (c: Candidate) => {
    const names = Array.from(new Set(c.jobLinks.map((l) => l.organizationName).filter(Boolean)));
    return names.length ? names.join(', ') : '—';
  };

  const filtered = data?.items ?? [];

  return (
    <AppLayout
      title="Master Database"
    >
      <form
        className="mb-3 flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setParam('q', qDraft.trim() || null);
        }}
      >
        <div className="relative flex-1">
          <Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle-foreground" />
          <Input value={qDraft} onChange={(e) => setQDraft(e.target.value)} placeholder="Search the pool…" className="!h-8 !pl-8 !text-xs" aria-label="Search" />
        </div>
      </form>
      {isLoading ? (
        <TableSkeleton cols={7} />
      ) : (
        <div className={isFetching ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
        <TableShell>
          <Thead>
            <tr>
              <Th>Name</Th>
              <Th>Client</Th>
              <Th>Designation</Th>
              <Th>Company</Th>
              <Th>Location</Th>
              <Th>Status</Th>
              <Th>Roles</Th>
            </tr>
          </Thead>
          <tbody>
            {filtered.map((c) => (
              <Tr key={c._id} onClick={() => navigate(`/candidates/${c._id}`)}>
                <Td>
                  <div className="flex items-center gap-3">
                    <Avatar name={c.firstName} />
                    <span className="font-medium text-foreground">
                      {c.firstName} {c.lastName}
                    </span>
                    {c.source === 'LINKEDIN' && (
                      <Icon name="linkedin" size={13} className="shrink-0 text-subtle-foreground" aria-label="Sourced from LinkedIn" />
                    )}
                  </div>
                </Td>
                <Td>{clientNames(c)}</Td>
                <Td>{c.currentTitle || '—'}</Td>
                <Td>{c.currentCompany || '—'}</Td>
                <Td>{c.location || '—'}</Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <GlobalStatusBadge status={c.globalStatus} />
                    {c.globalStatus !== 'OPEN' && c.globalStatus !== 'SELECTED' && (
                      <CandidateStatusBadge status={c.status} />
                    )}
                  </div>
                </Td>
                <Td>
                  {c.jobLinks.length === 0 ? (
                    <span className="text-xs text-subtle-foreground">Not linked</span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {c.jobLinks.slice(0, 2).map((l) => (
                        <span
                          key={l.jobId}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-2xs text-muted-foreground"
                        >
                          <span className="max-w-[10rem] truncate text-foreground">{l.jobTitle}</span>
                          <StageBadge stage={l.stage} />
                        </span>
                      ))}
                      {c.jobLinks.length > 2 && (
                        <Badge tone="neutral">+{c.jobLinks.length - 2}</Badge>
                      )}
                    </div>
                  )}
                </Td>
              </Tr>
            ))}
            {filtered.length === 0 && (
              <EmptyRow colSpan={7}>{q ? `No one in the pool matches “${q}”.` : 'No candidates in the master database yet.'}</EmptyRow>
            )}
          </tbody>
        </TableShell>
        {data && <Pagination className="mt-3" page={data.page} pageSize={data.pageSize} total={data.total} onPage={(n) => setParam('page', n === 1 ? null : String(n))} />}
        </div>
      )}
    </AppLayout>
  );
}
