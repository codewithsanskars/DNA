import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import Modal from '../shared/Modal';
import LoadingSpinner from '../shared/LoadingSpinner';
import { StatusBadge, StageBadge } from '../shared/Badge';
import { jobApi } from '../../api/job.api';
import { Job, WorkType, PayrollType } from '../../types';

const WORK_TYPE_LABELS: Record<WorkType, string> = {
  FULL_TIME: 'Full-Time',
  PART_TIME: 'Part-Time',
  CONTRACT: 'Contract',
  CONTRACT_TO_HIRE: 'Contract-to-Hire',
};

const PAYROLL_LABELS: Record<PayrollType, string> = {
  THIRD_PARTY: 'Third Party',
  IN_HOUSE: "Client's Own Payroll",
};

type Tab = 'details' | 'candidates';

export default function JobDetailModal({ job, onClose }: { job: Job; onClose: () => void }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('details');

  const { data: candidates, isLoading } = useQuery({
    queryKey: ['pipeline', job._id],
    queryFn: () => jobApi.getJobPipeline(job._id),
    enabled: tab === 'candidates',
  });

  return (
    <Modal title={job.title} onClose={onClose} size="lg">
      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-gray-200 dark:border-[#222]">
        {(['details', 'candidates'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? 'border-b-2 border-brand-600 text-brand-600 dark:text-brand-400'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            {t === 'details' ? 'Job Info' : `Candidates (${job.totalCandidates})`}
          </button>
        ))}
      </div>

      {tab === 'details' ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <StatusBadge status={job.status} />
            {job.department && <span className="text-xs text-gray-500 dark:text-gray-400">{job.department}</span>}
            {job.location && <span className="text-xs text-gray-500 dark:text-gray-400">📍 {job.location}</span>}
          </div>

          {job.description && (
            <div>
              <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">Description</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{job.description}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">Pay Rate</p>
              <p className="text-sm text-gray-900 dark:text-white">{job.payRate || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Billable Hours</p>
              <p className="text-sm text-gray-900 dark:text-white">{job.billableHours || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Type of Work</p>
              <p className="text-sm text-gray-900 dark:text-white">
                {job.workType ? WORK_TYPE_LABELS[job.workType] : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Payroll</p>
              <p className="text-sm text-gray-900 dark:text-white">
                {job.payrollType ? PAYROLL_LABELS[job.payrollType] : '—'}
              </p>
            </div>
            {job.openedAt && (
              <div>
                <p className="text-xs text-gray-500">Opened</p>
                <p className="text-sm text-gray-900 dark:text-white">
                  {new Date(job.openedAt).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="space-y-2">
          {(candidates || []).map((c) => (
            <button
              key={c._id}
              type="button"
              onClick={() => navigate(`/candidates/${c._id}`)}
              className="flex w-full items-center justify-between rounded-lg border border-gray-200 p-3 text-left transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-[#222] dark:hover:border-[#333] dark:hover:bg-[#1a1a1a]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-900 dark:bg-[#1a1a1a] dark:text-white">
                  {c.firstName.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {c.firstName} {c.lastName}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {c.currentTitle} {c.currentCompany && `@ ${c.currentCompany}`}
                  </p>
                </div>
              </div>
              <StageBadge stage={c.stage} />
            </button>
          ))}
          {(!candidates || candidates.length === 0) && (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No candidates yet for this role.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
