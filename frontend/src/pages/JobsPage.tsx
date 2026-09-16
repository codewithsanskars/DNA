import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import AppLayout from '../components/layout/AppLayout';
import { StatusBadge } from '../components/shared/Badge';
import Button from '../components/shared/Button';
import Modal from '../components/shared/Modal';
import { Field, Input, Select, Textarea } from '../components/shared/Field';
import { TableShell, Thead, Th, Tr, Td, EmptyRow } from '../components/shared/Table';
import { TableSkeleton } from '../components/shared/States';
import JobDetailModal from '../components/jobs/JobDetailModal';
import { jobApi } from '../api/job.api';
import { queryKeys } from '../api/queryKeys';
import { useJobs } from '../hooks/useJobs';
import { useOrganizations } from '../hooks/useOrganizations';
import { useAuth } from '../context/AuthContext';
import { isAdminRole } from '../utils/roles';
import { useToast } from '../components/shared/Toast';
import { formatDate } from '../utils/format';
import { Job, WorkType, PayrollType } from '../types';

export default function JobsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = isAdminRole(user?.role);
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
  const [clientId, setClientId] = useState('');

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
    setClientId('');
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
    setBillableHours(job.billableHours || '');
    setWorkType(job.workType || 'FULL_TIME');
    setPayrollType(job.payrollType || 'THIRD_PARTY');
    setClientId(job.organizationId || '');
    setSelectedJob(null);
    setShowForm(true);
  };

  const createJob = useMutation({
    mutationFn: jobApi.createJob,
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
      resetForm();
      toast.success('Role created', job?.title ? `“${job.title}” is now open.` : undefined);
    },
    onError: () => toast.error('Couldn’t create the role', 'Please try again.'),
  });

  const updateJob = useMutation({
    mutationFn: (data: Parameters<typeof jobApi.updateJob>[1]) => jobApi.updateJob(editingJob!._id, data),
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
      resetForm();
      toast.success('Role updated', job?.title ? `“${job.title}” was saved.` : undefined);
    },
    onError: () => toast.error('Couldn’t update the role', 'Please try again.'),
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
        billableHours: billableHours.trim() || undefined,
        workType,
        payrollType,
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
      billableHours: billableHours.trim() || undefined,
      workType,
      payrollType,
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
                    step="0.01"
                    value={billRate}
                    onChange={(e) => setBillRate(e.target.value)}
                    placeholder="e.g. 90"
                  />
                )}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Billable hours">
                {(id) => (
                  <Input
                    id={id}
                    value={billableHours}
                    onChange={(e) => setBillableHours(e.target.value)}
                    placeholder="e.g. 40 hrs/week"
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
                    <option value="THIRD_PARTY">Third Party</option>
                    <option value="IN_HOUSE">Client's Own Payroll</option>
                  </Select>
                )}
              </Field>
            </div>

            {savingJob.isError && (
              <p className="text-xs text-brand-text">
                {isEditing ? 'Failed to update the role. Please try again.' : 'Failed to create the role. Please try again.'}
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
