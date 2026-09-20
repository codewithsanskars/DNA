import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import Badge, { StageBadge, GlobalStatusBadge, CandidateStatusBadge } from '../components/shared/Badge';
import Button from '../components/shared/Button';
import Avatar from '../components/shared/Avatar';
import Icon from '../components/shared/Icon';
import Modal from '../components/shared/Modal';
import { Field, Input, Select, Textarea } from '../components/shared/Field';
import { TableShell, Thead, Th, Tr, Td, EmptyRow } from '../components/shared/Table';
import { TableSkeleton } from '../components/shared/States';
import { candidateApi } from '../api/candidate.api';
import { queryKeys } from '../api/queryKeys';
import { Candidate, GlobalStatus } from '../types';
import { humanize } from '../utils/format';
import { errorMessage } from '../utils/errors';
import { useJobs } from '../hooks/useJobs';
import { useCandidates } from '../hooks/useCandidates';
import { useAuth } from '../context/AuthContext';
import { isAdminRole } from '../utils/roles';
import { useToast } from '../components/shared/Toast';
import { isValidEmail, isValidNoticePeriod } from '../utils/validation';
import { RESUME_ACCEPT } from './CandidateDetailPage';

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
  const [phone, setPhone] = useState('');
  const [currentTitle, setCurrentTitle] = useState('');
  const [currentCompany, setCurrentCompany] = useState('');
  const [location, setLocation] = useState('');
  const [skills, setSkills] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [website, setWebsite] = useState('');
  const [notes, setNotes] = useState('');
  const [source, setSource] = useState<'PORTAL' | 'LINKEDIN'>('PORTAL');
  const [noticePeriod, setNoticePeriod] = useState('');
  const [jobId, setJobId] = useState(jobIdParam || '');
  // Only relevant while creating a candidate (no id yet to upload against) —
  // queued locally and uploaded right after the candidate is created.
  const [pendingResumeFile, setPendingResumeFile] = useState<File | null>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);

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
    setPhone('');
    setCurrentTitle('');
    setCurrentCompany('');
    setLocation('');
    setSkills('');
    setLinkedinUrl('');
    setWebsite('');
    setNotes('');
    setSource('PORTAL');
    setNoticePeriod('');
    setJobId(jobIdParam || '');
    setPendingResumeFile(null);
  };

  const createCandidate = useMutation({
    mutationFn: candidateApi.createCandidate,
    onSuccess: async (candidate) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.candidates });
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
      resetForm();
      if (!pendingResumeFile) {
        toast.success(
          'Candidate added',
          candidate ? `${candidate.firstName} ${candidate.lastName} is now in your list.` : undefined
        );
        return;
      }
      // The candidate now has an id, so the queued résumé can go up. Reported
      // separately since it's a second request that can fail independently.
      try {
        await candidateApi.uploadResume(candidate._id, pendingResumeFile);
        queryClient.invalidateQueries({ queryKey: queryKeys.candidates });
        toast.success('Candidate added', `${candidate.firstName} ${candidate.lastName} is now in your list, with their résumé attached.`);
      } catch (err) {
        toast.error(
          `${candidate.firstName} ${candidate.lastName} was added, but the résumé couldn’t be attached`,
          errorMessage(err, 'You can attach it from their profile.')
        );
      }
    },
    onError: () => toast.error('Couldn’t add the candidate', 'Please try again.'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim()) return;
    if (!isValidEmail(email)) {
      toast.error('Invalid email', 'Enter a valid email address.');
      return;
    }
    if (!isValidNoticePeriod(noticePeriod)) {
      toast.error('Invalid notice period', 'Enter a whole number of days, 0 or more.');
      return;
    }
    createCandidate.mutate({
      jobId: jobId || undefined,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      currentTitle: currentTitle.trim() || undefined,
      currentCompany: currentCompany.trim() || undefined,
      location: location.trim() || undefined,
      skills: skills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      linkedinUrl: linkedinUrl.trim() || undefined,
      website: website.trim() || undefined,
      notes: notes.trim() || undefined,
      source,
      noticePeriod: noticePeriod.trim() ? Number(noticePeriod) : undefined,
    });
  };

  const handleResumeFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/\.(pdf|docx)$/i.test(file.name)) {
      toast.error('Résumé must be a .pdf or .docx file');
      return;
    }
    setPendingResumeFile(file);
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

            <div className="grid gap-4 sm:grid-cols-2">
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
              <Field label="Phone">
                {(id) => (
                  <Input id={id} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. +1 555 010 1234" />
                )}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
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
              <Field label="Current company">
                {(id) => (
                  <Input
                    id={id}
                    value={currentCompany}
                    onChange={(e) => setCurrentCompany(e.target.value)}
                    placeholder="e.g. Acme Corp"
                  />
                )}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Location">
                {(id) => <Input id={id} value={location} onChange={(e) => setLocation(e.target.value)} />}
              </Field>
              <Field label="Notice period" hint="days">
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    step={1}
                    value={noticePeriod}
                    onChange={(e) => setNoticePeriod(e.target.value)}
                    placeholder="e.g. 30"
                  />
                )}
              </Field>
            </div>

            <Field label="Skills" hint="comma-separated">
              {(id) => (
                <Input
                  id={id}
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  placeholder="e.g. React, Node.js, SQL"
                />
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="LinkedIn URL">
                {(id) => (
                  <Input
                    id={id}
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    placeholder="https://linkedin.com/in/…"
                  />
                )}
              </Field>
              <Field label="Website">
                {(id) => (
                  <Input id={id} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />
                )}
              </Field>
            </div>

            <Field label="Notes">
              {(id) => <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Source">
                {(id) => (
                  <Select id={id} value={source} onChange={(e) => setSource(e.target.value as 'PORTAL' | 'LINKEDIN')}>
                    <option value="PORTAL">Portal</option>
                    <option value="LINKEDIN">LinkedIn</option>
                  </Select>
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
            </div>

            <div className="border-t border-border pt-4">
              <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle-foreground">Résumé</p>
              {pendingResumeFile ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[13px] text-foreground">
                    <Icon name="file" size={14} className="text-muted-foreground" />
                    {pendingResumeFile.name}
                  </span>
                  <Button type="button" variant="ghost" size="sm" icon="upload" onClick={() => resumeInputRef.current?.click()}>
                    Change
                  </Button>
                  <Button type="button" variant="ghost" size="sm" icon="trash" onClick={() => setPendingResumeFile(null)}>
                    Remove
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon="upload"
                  onClick={() => resumeInputRef.current?.click()}
                >
                  Attach résumé
                </Button>
              )}
              <input
                ref={resumeInputRef}
                type="file"
                accept={RESUME_ACCEPT}
                className="hidden"
                onChange={handleResumeFile}
              />
            </div>

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
