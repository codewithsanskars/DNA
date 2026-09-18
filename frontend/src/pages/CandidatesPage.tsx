import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import Badge, { StageBadge } from '../components/shared/Badge';
import Button from '../components/shared/Button';
import Avatar from '../components/shared/Avatar';
import Icon from '../components/shared/Icon';
import Modal from '../components/shared/Modal';
import { Field, Input, Select } from '../components/shared/Field';
import { TableShell, Thead, Th, Tr, Td, EmptyRow } from '../components/shared/Table';
import { TableSkeleton } from '../components/shared/States';
import { candidateApi } from '../api/candidate.api';
import { queryKeys } from '../api/queryKeys';
import { Candidate } from '../types';
import { useJobs } from '../hooks/useJobs';
import { useCandidates } from '../hooks/useCandidates';
import { useAuth } from '../context/AuthContext';
import { isAdminRole } from '../utils/roles';
import { useToast } from '../components/shared/Toast';

export default function CandidatesPage() {
  const navigate = useNavigate();
  const { id: jobIdParam } = useParams<{ id?: string }>();
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

  const filtered = jobIdParam
    ? (candidates || []).filter((c) => c.jobLinks.some((l) => l.jobId === jobIdParam))
    : candidates || [];

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

            <Field label="Current title">
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

      {loading ? (
        <TableSkeleton cols={isAdmin ? 5 : 4} />
      ) : (
        <TableShell>
          <Thead>
            <tr>
              <Th>Name</Th>
              {isAdmin && <Th>Client</Th>}
              <Th>Title / Company</Th>
              <Th>Location</Th>
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
                {isAdmin && <Td>{clientNames(c)}</Td>}
                <Td>
                  {c.currentTitle || '—'}
                  {c.currentCompany && <span className="text-subtle-foreground"> · {c.currentCompany}</span>}
                </Td>
                <Td>{c.location || '—'}</Td>
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
              <EmptyRow colSpan={isAdmin ? 5 : 4}>
                {jobIdParam ? 'No candidates linked to this role.' : 'No candidates yet.'}
              </EmptyRow>
            )}
          </tbody>
        </TableShell>
      )}
    </AppLayout>
  );
}
