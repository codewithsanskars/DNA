import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import Badge, { StageBadge, GlobalStatusBadge, CandidateStatusBadge } from '../components/shared/Badge';
import Avatar from '../components/shared/Avatar';
import Icon from '../components/shared/Icon';
import { TableShell, Thead, Th, Tr, Td, EmptyRow } from '../components/shared/Table';
import { TableSkeleton } from '../components/shared/States';
import { useCandidates } from '../hooks/useCandidates';
import { Candidate, ArchivedCandidateStatus } from '../types';

// Archived candidates still worth resurfacing — everyone else archived
// (blacklisted, offboarded) has no place in the pool of reachable candidates.
const REACHABLE_ARCHIVED_STATUSES: ArchivedCandidateStatus[] = ['OPPORTUNITY', 'CONTACTED', 'NOT_INTERESTED'];

function isInMasterDatabase(c: Candidate) {
  if (c.globalStatus === 'OPEN') return true;
  if (c.globalStatus === 'ARCHIVED') {
    return REACHABLE_ARCHIVED_STATUSES.includes(c.status as ArchivedCandidateStatus);
  }
  return false;
}

export default function MasterDatabasePage() {
  const navigate = useNavigate();
  const { data: candidates, isLoading } = useCandidates();

  const clientNames = (c: Candidate) => {
    const names = Array.from(new Set(c.jobLinks.map((l) => l.organizationName).filter(Boolean)));
    return names.length ? names.join(', ') : '—';
  };

  const filtered = (candidates || []).filter(isInMasterDatabase);

  return (
    <AppLayout
      title="Master Database"
    >
      {isLoading ? (
        <TableSkeleton cols={7} />
      ) : (
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
            {filtered.length === 0 && <EmptyRow colSpan={7}>No candidates in the master database yet.</EmptyRow>}
          </tbody>
        </TableShell>
      )}
    </AppLayout>
  );
}
