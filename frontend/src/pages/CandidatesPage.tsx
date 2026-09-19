import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import Badge, { StageBadge, GlobalStatusBadge, CandidateStatusBadge } from '../components/shared/Badge';
import Button from '../components/shared/Button';
import Avatar from '../components/shared/Avatar';
import Icon from '../components/shared/Icon';
import Modal from '../components/shared/Modal';
import { Field, Input, Select } from '../components/shared/Field';
import { TableShell, Thead, Th, Tr, Td, EmptyRow } from '../components/shared/Table';
import { TableSkeleton } from '../components/shared/States';
import { candidateApi } from '../api/candidate.api';
import { queryKeys } from '../api/queryKeys';
import { Candidate, GlobalStatus } from '../types';
import { humanize } from '../utils/format';
import { useJobs } from '../hooks/useJobs';
import { useCandidates } from '../hooks/useCandidates';
import { useAuth } from '../context/AuthContext';
import { isAdminRole } from '../utils/roles';
import { useToast } from '../components/shared/Toast';

const GLOBAL_STATUS_TABS: GlobalStatus[] = ['OPEN', 'SELECTED', 'ONBOARDED', 'ARCHIVED'];

export default function CandidatesPage() {
  const navigate = useNavigate();
  const { id: jobIdParam } = useParams<{ id?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = isAdminRole(user?.role);
  const [showForm, setShowForm] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [currentTitle, setCurrentTitle] = useState('');
  const [jobId, setJobId] = useState(jobIdParam || '');

  // Kept in the URL (not local state) so the tab survives a round trip
  // through a candidate's detail page — the back button there returns here
  // with `?tab=…` set, instead of always landing back on OPEN.
  const tabParam = searchParams.get('tab') as GlobalStatus | null;
  const activeTab: GlobalStatus = tabParam && GLOBAL_STATUS_TABS.includes(tabParam) ? tabParam : 'OPEN';
  const setActiveTab = (tab: GlobalStatus) => {
    setSearchParams(tab === 'OPEN' ? {} : { tab }, { replace: false });
  };

  const { data: jobs, isLoading: jobsLoading } = useJobs();
  const { data: candidates, isLoading: candidatesLoading } = useCandidates();

  const activeJob = jobIdParam ? jobs?.find((j) => j._id === jobIdParam) : undefined;

  const resetForm = () => {
    setShowForm(false);
    setFirstName('');
    setLastName('');
    setEmail('');
    setCurrentTitle('');
    setJobId(jobIdParam || '');
  };

  const createCandidate = useMutation({
    mutationFn: candidateApi.createCandidate,
    onSuccess: (candidate) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.candidates });
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
      resetForm();
      toast.success(
        'Candidate added',
        candidate ? `${candidate.firstName} ${candidate.lastName} is now in your list.` : undefined
      );
    },
    onError: () => toast.error('Couldn’t add the candidate', 'Please try again.'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim()) return;
    createCandidate.mutate({
      jobId: jobId || undefined,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      currentTitle: currentTitle.trim() || undefined,
    });
  };

  const loading = jobsLoading || candidatesLoading;

  const clientNames = (c: Candidate) => {
    const names = Array.from(new Set(c.jobLinks.map((l) => l.organizationName).filter(Boolean)));
    return names.length ? names.join(', ') : '—';
  };

  const byJob = jobIdParam
    ? (candidates || []).filter((c) => c.jobLinks.some((l) => l.jobId === jobIdParam))
    : candidates || [];

  const tabCounts = GLOBAL_STATUS_TABS.reduce<Record<GlobalStatus, number>>((acc, tab) => {
    acc[tab] = byJob.filter((c) => c.globalStatus === tab).length;
    return acc;
  }, {} as Record<GlobalStatus, number>);

  const filtered = byJob.filter((c) => c.globalStatus === activeTab);
  const showClient = isAdmin && (activeTab === 'SELECTED' || activeTab === 'ONBOARDED');

  return (
    <AppLayout
      title={activeJob ? activeJob.title : 'Candidates'}
      backTo={jobIdParam ? '/jobs' : undefined}
      backLabel="Back to roles"
      actions={
        <>
          {isAdmin && (
            <Button variant="primary" icon="plus" onClick={() => setShowForm(true)}>
              New candidate
            </Button>
          )}
        </>
      }
    >
      {showForm && (
        <Modal
          title="New candidate"
          description="Add a candidate to the portal."
          onClose={resetForm}
          size="full"
          centered
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" required>
                {(id) => (
                  <Input id={id} value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                )}
              </Field>
              <Field label="Last name" required>
                {(id) => (
                  <Input id={id} value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                )}
              </Field>
            </div>

            <Field label="Email" required>
              {(id) => (
                <Input
                  id={id}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="name@company.com"
                />
              )}
            </Field>

            <Field label="Current designation">
              {(id) => (
                <Input
                  id={id}
                  value={currentTitle}
                  onChange={(e) => setCurrentTitle(e.target.value)}
                  placeholder="e.g. Backend Engineer"
                />
              )}
            </Field>

            <Field
              label="Link to role"
              hint="optional"
              help="A candidate's client is determined by the role(s) they're linked to — leave this unset to keep them in the unassigned pool for now."
            >
              {(id) => (
                <Select id={id} value={jobId} onChange={(e) => setJobId(e.target.value)}>
                  <option value="">No role yet</option>
                  {(jobs || []).map((j) => (
                    <option key={j._id} value={j._id}>
                      {j.title}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            {createCandidate.isError && (
              <p className="text-xs text-brand-text">Failed to add the candidate. Please try again.</p>
            )}

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="ghost" onClick={resetForm}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={createCandidate.isPending}>
                {createCandidate.isPending ? 'Adding…' : 'Add candidate'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      <div className="mb-4 flex flex-wrap gap-1.5 border-b border-border">
        {GLOBAL_STATUS_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'border-brand text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {humanize(tab)}
            <span className="rounded-full bg-muted px-1.5 text-2xs font-medium text-muted-foreground ring-1 ring-inset ring-border">
              {tabCounts[tab]}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <TableSkeleton cols={showClient ? 7 : 6} />
      ) : (
        <TableShell>
          <Thead>
            <tr>
              <Th>Name</Th>
              {showClient && <Th>Client</Th>}
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
                {showClient && <Td>{clientNames(c)}</Td>}
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
              <EmptyRow colSpan={showClient ? 7 : 6}>
                {jobIdParam
                  ? `No ${humanize(activeTab).toLowerCase()} candidates linked to this role.`
                  : `No ${humanize(activeTab).toLowerCase()} candidates yet.`}
              </EmptyRow>
            )}
          </tbody>
        </TableShell>
      )}
    </AppLayout>
  );
}
