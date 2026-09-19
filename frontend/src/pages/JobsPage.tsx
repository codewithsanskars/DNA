import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import AppLayout from '../components/layout/AppLayout';
import { StatusBadge, PriorityBadge } from '../components/shared/Badge';
import Button from '../components/shared/Button';
import Modal from '../components/shared/Modal';
import { Field, Input, Select, Textarea } from '../components/shared/Field';
import { TableShell, Thead, Th, Tr, Td, EmptyRow } from '../components/shared/Table';
import { TableSkeleton } from '../components/shared/States';
import Icon from '../components/shared/Icon';
import JobDetailModal, { JD_ACCEPT } from '../components/jobs/JobDetailModal';
import { jobApi } from '../api/job.api';
import { queryKeys } from '../api/queryKeys';
import { useJobs } from '../hooks/useJobs';
import { useOrganizations } from '../hooks/useOrganizations';
import { useAuth } from '../context/AuthContext';
import { isAdminRole } from '../utils/roles';
import { useToast } from '../components/shared/Toast';
import { useConfirm } from '../components/shared/Confirm';
import { formatDate } from '../utils/format';
import { errorMessage } from '../utils/errors';
import { Job, WorkType, PayrollType, JobPriority } from '../types';

// Matches the backend's numeric(10,2) column limit for payRate/billRate
// (see job.controller.ts) — caps the input so the browser itself discourages
// a value the API would otherwise reject.
const MAX_RATE = 99_999_999.99;

// Billable hours are standardized to hrs/day across the portal — the form
// only collects the number and appends the unit, so every job (old
// "hrs/week" entries included) reads consistently once edited.
const parseHoursPerDay = (value?: string): string => value?.match(/[\d.]+/)?.[0] || '';
const formatHoursPerDay = (value: string): string | undefined =>
  value.trim() ? `${value.trim()} hrs/day` : undefined;

// IN_HOUSE reads differently depending on who's looking: from SWFS's side
// the client runs their own payroll; from the client's side it's their own.
const inHousePayrollLabel = (isAdmin: boolean) => (isAdmin ? 'Client Payroll' : 'Own Payroll');

export default function JobsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const isAdmin = isAdminRole(user?.role);
  const isClient = !isAdmin;
  const [showForm, setShowForm] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [payRate, setPayRate] = useState('');
  const [billRate, setBillRate] = useState('');
  const [billableHours, setBillableHours] = useState('');
  const [workType, setWorkType] = useState<WorkType>('FULL_TIME');
  const [payrollType, setPayrollType] = useState<PayrollType>('THIRD_PARTY');
  const [priority, setPriority] = useState<JobPriority>('MEDIUM');
  const [clientId, setClientId] = useState('');
  // Only relevant while creating a role (it has no id yet, so there's nothing
  // to upload against) — queued locally and uploaded right after the role is
  // created. When editing, the job already has an id, so jdUpload/jdDelete
  // below act on it directly instead.
  const [pendingJdFile, setPendingJdFile] = useState<File | null>(null);
  const jdInputRef = useRef<HTMLInputElement>(null);

  const { data: jobs, isLoading } = useJobs();
  const { organizations: clients, clientName } = useOrganizations({ enabled: isAdmin });

  const resetForm = () => {
    setShowForm(false);
    setEditingJob(null);
    setTitle('');
    setDepartment('');
    setLocation('');
    setDescription('');
    setPayRate('');
    setBillRate('');
    setBillableHours('');
    setWorkType('FULL_TIME');
    setPayrollType('THIRD_PARTY');
    setPriority('MEDIUM');
    setClientId('');
    setPendingJdFile(null);
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (job: Job) => {
    setEditingJob(job);
    setTitle(job.title);
    setDepartment(job.department || '');
    setLocation(job.location || '');
    setDescription(job.description || '');
    setPayRate(job.payRate != null ? String(job.payRate) : '');
    setBillRate(job.billRate != null ? String(job.billRate) : '');
    setBillableHours(parseHoursPerDay(job.billableHours));
    setWorkType(job.workType || 'FULL_TIME');
    setPayrollType(job.payrollType || 'THIRD_PARTY');
    setPriority(job.priority || 'MEDIUM');
    setClientId(job.organizationId || '');
    setSelectedJob(null);
    setShowForm(true);
  };

  const createJob = useMutation({
    mutationFn: jobApi.createJob,
    onSuccess: async (job) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
      resetForm();
      if (!pendingJdFile) {
        toast.success('Role created', job?.title ? `“${job.title}” is now open.` : undefined);
        return;
      }
      // The role now has an id, so the queued file can go up. Reported
      // separately from role creation since it's a second request that can
      // fail independently (bad file, size limit) even though the role
      // itself was created fine.
      try {
        await jobApi.uploadJobDescription(job._id, pendingJdFile);
        queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
        toast.success('Role created', `“${job.title}” is now open, with its job description attached.`);
      } catch (err) {
        toast.error(
          `“${job.title}” was created, but the job description couldn’t be attached`,
          errorMessage(err, 'You can attach it from the role’s details.')
        );
      }
    },
    onError: (err) => toast.error('Couldn’t create the role', errorMessage(err, 'Please try again.')),
  });

  const uploadJd = useMutation({
    mutationFn: (file: File) => jobApi.uploadJobDescription(editingJob!._id, file),
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
      setEditingJob(job);
      toast.success('Job description attached');
    },
    onError: (err) => toast.error('Couldn’t attach that job description', errorMessage(err, 'Please try again.')),
  });

  const deleteJd = useMutation({
    mutationFn: () => jobApi.deleteJobDescription(editingJob!._id),
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
      setEditingJob(job);
      toast.success('Job description removed');
    },
    onError: (err) => toast.error('Couldn’t remove the job description', errorMessage(err, 'Please try again.')),
  });

  const handleJdFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/\.(pdf|docx)$/i.test(file.name)) {
      toast.error('Job description must be a .pdf or .docx file');
      return;
    }
    if (isEditing) {
      uploadJd.mutate(file);
    } else {
      setPendingJdFile(file);
    }
  };

  const confirmDeleteJd = async () => {
    const ok = await confirm({
      title: 'Remove job description?',
      description: `This removes the attached job description from "${editingJob?.title}".`,
      confirmLabel: 'Remove file',
      tone: 'danger',
    });
    if (ok) deleteJd.mutate();
  };

  const updateJob = useMutation({
    mutationFn: (data: Parameters<typeof jobApi.updateJob>[1]) => jobApi.updateJob(editingJob!._id, data),
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
      resetForm();
      toast.success('Role updated', job?.title ? `“${job.title}” was saved.` : undefined);
    },
    onError: (err) => toast.error('Couldn’t update the role', errorMessage(err, 'Please try again.')),
  });

  const isEditing = !!editingJob;
  const savingJob = isEditing ? updateJob : createJob;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const parsedPayRate = payRate.trim() ? Number(payRate) : undefined;
    const parsedBillRate = billRate.trim() ? Number(billRate) : undefined;
    if (isEditing) {
      updateJob.mutate({
        title: title.trim(),
        department: department.trim() || undefined,
        location: location.trim() || undefined,
        description: description.trim() || undefined,
        payRate: isAdmin ? parsedPayRate : undefined,
        billRate: parsedBillRate,
        billableHours: formatHoursPerDay(billableHours),
        workType,
        payrollType,
        priority,
      });
      return;
    }
    if (isAdmin && !clientId) return;
    createJob.mutate({
      title: title.trim(),
      department: department.trim() || undefined,
      location: location.trim() || undefined,
      description: description.trim() || undefined,
      payRate: isAdmin ? parsedPayRate : undefined,
      billRate: parsedBillRate,
      billableHours: formatHoursPerDay(billableHours),
      workType,
      payrollType,
      priority,
      organizationId: isAdmin ? clientId : undefined,
    });
  };

  const jobCount = jobs?.length ?? 0;

  return (
    <AppLayout
      title="Open Roles"
      actions={
        <>
          <p className="text-[13px] text-muted-foreground">
            {isLoading ? 'Loading…' : `${jobCount} ${jobCount === 1 ? 'role' : 'roles'}`}
          </p>
          <Button variant="primary" icon="plus" onClick={openCreateForm}>
            New role
          </Button>
        </>
      }
    >
      {showForm && (
        <Modal
          title={isEditing ? 'Edit job opening' : 'New job opening'}
          description={
            isEditing ? 'Update the details of this role.' : 'Post a role to start collecting candidates.'
          }
          onClose={resetForm}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {isAdmin && !isEditing && (
              <Field label="Client" required>
                {(id) => (
                  <Select id={id} value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                    <option value="">Select a client…</option>
                    {(clients || []).map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}

            <Field label="Title" required>
              {(id) => (
                <Input
                  id={id}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="e.g. Senior Software Engineer"
                />
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Department">
                {(id) => (
                  <Input
                    id={id}
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="e.g. Engineering"
                  />
                )}
              </Field>
              <Field label="Location">
                {(id) => (
                  <Input
                    id={id}
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Remote (US)"
                  />
                )}
              </Field>
            </div>

            <Field label="Description">
              {(id) => (
                <Textarea
                  id={id}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What will this person be doing?"
                />
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              {isAdmin && (
                <Field label="Pay rate" hint="$/hr · not shown to the client">
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      min="0"
                      max={MAX_RATE}
                      step="0.01"
                      value={payRate}
                      onChange={(e) => setPayRate(e.target.value)}
                      placeholder="e.g. 70"
                    />
                  )}
                </Field>
              )}
              <Field label="Bill rate" hint="$/hr">
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min="0"
                    max={MAX_RATE}
                    step="0.01"
                    value={billRate}
                    onChange={(e) => setBillRate(e.target.value)}
                    placeholder="e.g. 90"
                  />
                )}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Billable hours" hint="hrs/day">
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    max={24}
                    step={0.5}
                    value={billableHours}
                    onChange={(e) => setBillableHours(e.target.value)}
                    placeholder="e.g. 8"
                  />
                )}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type of work">
                {(id) => (
                  <Select id={id} value={workType} onChange={(e) => setWorkType(e.target.value as WorkType)}>
                    <option value="FULL_TIME">Full-Time</option>
                    <option value="PART_TIME">Part-Time</option>
                    <option value="CONTRACT">Contract</option>
                    <option value="CONTRACT_TO_HIRE">Contract-to-Hire</option>
                  </Select>
                )}
              </Field>
              <Field label="Payroll">
                {(id) => (
                  <Select
                    id={id}
                    value={payrollType}
                    onChange={(e) => setPayrollType(e.target.value as PayrollType)}
                  >
                    <option value="THIRD_PARTY">SWFS</option>
                    <option value="IN_HOUSE">{inHousePayrollLabel(isAdmin)}</option>
                  </Select>
                )}
              </Field>
            </div>

            <Field label="Priority" hint="How urgently this role needs to be filled">
              {(id) => (
                <div className="flex items-center gap-3">
                  <Select
                    id={id}
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as JobPriority)}
                    className="max-w-[160px]"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </Select>
                  <PriorityBadge priority={priority} />
                </div>
              )}
            </Field>

            {isClient && (
              <div className="border-t border-border pt-4">
                <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle-foreground">
                  Job description
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {isEditing ? (
                    editingJob?.jdUrl ? (
                      <>
                        <span className="inline-flex items-center gap-1.5 text-[13px] text-foreground">
                          <Icon name="file" size={14} className="text-muted-foreground" />
                          {editingJob.jdFileName || 'Job description'}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          icon="upload"
                          onClick={() => jdInputRef.current?.click()}
                          loading={uploadJd.isPending}
                        >
                          Replace
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          icon="trash"
                          onClick={confirmDeleteJd}
                          loading={deleteJd.isPending}
                        >
                          Remove
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        icon="upload"
                        onClick={() => jdInputRef.current?.click()}
                        loading={uploadJd.isPending}
                      >
                        Attach job description
                      </Button>
                    )
                  ) : pendingJdFile ? (
                    <>
                      <span className="inline-flex items-center gap-1.5 text-[13px] text-foreground">
                        <Icon name="file" size={14} className="text-muted-foreground" />
                        {pendingJdFile.name}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        icon="upload"
                        onClick={() => jdInputRef.current?.click()}
                      >
                        Change
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        icon="trash"
                        onClick={() => setPendingJdFile(null)}
                      >
                        Remove
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      icon="upload"
                      onClick={() => jdInputRef.current?.click()}
                    >
                      Attach job description
                    </Button>
                  )}
                  <input
                    ref={jdInputRef}
                    type="file"
                    accept={JD_ACCEPT}
                    className="hidden"
                    onChange={handleJdFile}
                  />
                </div>
                {!isEditing && pendingJdFile && (
                  <p className="mt-1.5 text-2xs text-muted-foreground">
                    Will be attached once the role is created.
                  </p>
                )}
              </div>
            )}

            {savingJob.isError && (
              <p className="text-xs text-brand-text">
                {errorMessage(
                  savingJob.error,
                  isEditing ? 'Failed to update the role. Please try again.' : 'Failed to create the role. Please try again.'
                )}
              </p>
            )}

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="ghost" onClick={resetForm}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={savingJob.isPending}>
                {isEditing
                  ? savingJob.isPending
                    ? 'Saving…'
                    : 'Save changes'
                  : savingJob.isPending
                    ? 'Creating…'
                    : 'Create role'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {selectedJob && (
        <JobDetailModal job={selectedJob} onClose={() => setSelectedJob(null)} onEdit={openEditForm} />
      )}

      {isLoading ? (
        <TableSkeleton cols={isAdmin ? 6 : 5} />
      ) : (
        <TableShell>
          <Thead>
            <tr>
              <Th>Title</Th>
              {isAdmin && <Th>Client</Th>}
              <Th>Department</Th>
              <Th>Location</Th>
              <Th>Status</Th>
              <Th className="text-right">Candidates</Th>
              <Th>Opened</Th>
            </tr>
          </Thead>
          <tbody>
            {(jobs || []).map((job) => (
              <Tr key={job._id} onClick={() => setSelectedJob(job)}>
                <Td className="font-medium text-foreground">{job.title}</Td>
                {isAdmin && <Td>{clientName(job.organizationId)}</Td>}
                <Td>{job.department || '—'}</Td>
                <Td>{job.location || '—'}</Td>
                <Td>
                  <StatusBadge status={job.status} />
                </Td>
                <Td className="text-right font-medium tabular-nums text-foreground">
                  {job.totalCandidates}
                </Td>
                <Td className="tabular-nums">
                  {job.openedAt ? formatDate(job.openedAt) : '—'}
                </Td>
              </Tr>
            ))}
            {(!jobs || jobs.length === 0) && (
              <EmptyRow colSpan={isAdmin ? 7 : 6}>No roles have been posted yet.</EmptyRow>
            )}
          </tbody>
        </TableShell>
      )}
    </AppLayout>
  );
}
