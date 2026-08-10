import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AppLayout from '../components/layout/AppLayout';
import { StatusBadge } from '../components/shared/Badge';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import Modal from '../components/shared/Modal';
import { TableShell, Th, Tr, Td, EmptyRow } from '../components/shared/Table';
import JobDetailModal from '../components/jobs/JobDetailModal';
import { jobApi } from '../api/job.api';
import { Job, WorkType, PayrollType } from '../types';

export default function JobsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [payRate, setPayRate] = useState('');
  const [billableHours, setBillableHours] = useState('');
  const [workType, setWorkType] = useState<WorkType>('FULL_TIME');
  const [payrollType, setPayrollType] = useState<PayrollType>('THIRD_PARTY');

  const { data: jobs, isLoading } = useQuery({ queryKey: ['jobs'], queryFn: jobApi.getJobs });

  const createJob = useMutation({
    mutationFn: jobApi.createJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      setShowForm(false);
      setTitle('');
      setDepartment('');
      setLocation('');
      setDescription('');
      setPayRate('');
      setBillableHours('');
      setWorkType('FULL_TIME');
      setPayrollType('THIRD_PARTY');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    createJob.mutate({
      title: title.trim(),
      department: department.trim() || undefined,
      location: location.trim() || undefined,
      description: description.trim() || undefined,
      payRate: payRate.trim() || undefined,
      billableHours: billableHours.trim() || undefined,
      workType,
      payrollType,
    });
  };

  const inputClass =
    'w-full rounded border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none dark:border-[#333] dark:bg-[#0a0a0a] dark:text-white';
  const labelClass = 'mb-1 block text-xs text-gray-500 dark:text-gray-400';

  return (
    <AppLayout title="Open Roles" subtitle="All active and recent job postings">
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + New Job
        </button>
      </div>

      {showForm && (
        <Modal title="New Job Opening" onClose={() => setShowForm(false)}>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className={labelClass}>Title *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className={inputClass}
                placeholder="e.g. Senior Software Engineer"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Department</label>
                <input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. Engineering"
                />
              </div>
              <div>
                <label className={labelClass}>Location</label>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. Remote (US)"
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={`${inputClass} resize-none`}
                placeholder="What will this person be doing?"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Pay Rate</label>
                <input
                  value={payRate}
                  onChange={(e) => setPayRate(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. $60 - $75/hr"
                />
              </div>
              <div>
                <label className={labelClass}>Billable Hours</label>
                <input
                  value={billableHours}
                  onChange={(e) => setBillableHours(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. 40 hrs/week"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Type of Work</label>
                <select value={workType} onChange={(e) => setWorkType(e.target.value as WorkType)} className={inputClass}>
                  <option value="FULL_TIME">Full-Time</option>
                  <option value="PART_TIME">Part-Time</option>
                  <option value="CONTRACT">Contract</option>
                  <option value="CONTRACT_TO_HIRE">Contract-to-Hire</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Payroll</label>
                <select value={payrollType} onChange={(e) => setPayrollType(e.target.value as PayrollType)} className={inputClass}>
                  <option value="THIRD_PARTY">Third Party</option>
                  <option value="IN_HOUSE">Client's Own Payroll</option>
                </select>
              </div>
            </div>
            {createJob.isError && (
              <p className="text-xs text-red-400">Failed to create job. Please try again.</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 dark:border-[#333] dark:text-gray-300 dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createJob.isPending}
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {createJob.isPending ? 'Creating...' : 'Create Job'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {selectedJob && <JobDetailModal job={selectedJob} onClose={() => setSelectedJob(null)} />}

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Title</Th>
              <Th>Department</Th>
              <Th>Location</Th>
              <Th>Status</Th>
              <Th className="text-right">Candidates</Th>
              <Th>Opened</Th>
            </tr>
          </thead>
          <tbody>
            {(jobs || []).map((job) => (
              <Tr key={job._id} onClick={() => setSelectedJob(job)}>
                <Td className="font-medium text-gray-900 dark:text-white">{job.title}</Td>
                <Td className="text-gray-500 dark:text-gray-400">{job.department || '—'}</Td>
                <Td className="text-gray-500 dark:text-gray-400">{job.location || '—'}</Td>
                <Td>
                  <StatusBadge status={job.status} />
                </Td>
                <Td className="text-right font-medium text-gray-900 dark:text-white">{job.totalCandidates}</Td>
                <Td className="text-gray-500 dark:text-gray-400">
                  {job.openedAt ? new Date(job.openedAt).toLocaleDateString() : '—'}
                </Td>
              </Tr>
            ))}
            {(!jobs || jobs.length === 0) && <EmptyRow colSpan={6}>No jobs found.</EmptyRow>}
          </tbody>
        </TableShell>
      )}
    </AppLayout>
  );
}
