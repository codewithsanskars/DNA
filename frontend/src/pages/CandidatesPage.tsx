import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import { StageBadge } from '../components/shared/Badge';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import Modal from '../components/shared/Modal';
import { TableShell, Th, Tr, Td, EmptyRow } from '../components/shared/Table';
import { jobApi } from '../api/job.api';
import { candidateApi } from '../api/candidate.api';
import { Candidate, CandidateStage } from '../types';

const STAGES: (CandidateStage | 'ALL')[] = ['ALL', 'APPLIED', 'SCREENING', 'INTERVIEW', 'SHORTLISTED', 'OFFER', 'HIRED', 'REJECTED'];

export default function CandidatesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedStage, setSelectedStage] = useState<CandidateStage | 'ALL'>('ALL');
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [showForm, setShowForm] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [currentTitle, setCurrentTitle] = useState('');

  const { data: jobs, isLoading: jobsLoading } = useQuery({ queryKey: ['jobs'], queryFn: jobApi.getJobs });

  const { data: candidates, isLoading: candidatesLoading } = useQuery({
    queryKey: ['pipeline', selectedJobId],
    queryFn: () => jobApi.getJobPipeline(selectedJobId),
    enabled: !!selectedJobId,
  });

  const createCandidate = useMutation({
    mutationFn: candidateApi.createCandidate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline', selectedJobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      setShowForm(false);
      setFirstName('');
      setLastName('');
      setEmail('');
      setCurrentTitle('');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJobId || !firstName.trim() || !lastName.trim() || !email.trim()) return;
    createCandidate.mutate({
      jobId: selectedJobId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      currentTitle: currentTitle.trim() || undefined,
    });
  };

  const filtered: Candidate[] = (candidates || []).filter(
    (c) => selectedStage === 'ALL' || c.stage === selectedStage
  );

  return (
    <AppLayout title="Candidates" subtitle="View and manage candidates across all roles">
      {jobsLoading ? (
        <div className="flex h-64 items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <>
          {/* Job selector */}
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <label className="text-xs text-gray-500 dark:text-gray-400">Role:</label>
              <select
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
                className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 outline-none dark:border-[#333] dark:bg-[#111] dark:text-white"
              >
                <option value="">Select a role...</option>
                {(jobs || []).map((j) => (
                  <option key={j._id} value={j._id}>
                    {j.title}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              disabled={!selectedJobId}
              title={selectedJobId ? undefined : 'Select a role first'}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              + New Candidate
            </button>
          </div>

          {showForm && (
            <Modal title="New Candidate" onClose={() => setShowForm(false)}>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">First Name *</label>
                    <input
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                      className="w-full rounded border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none dark:border-[#333] dark:bg-[#0a0a0a] dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Last Name *</label>
                    <input
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                      className="w-full rounded border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none dark:border-[#333] dark:bg-[#0a0a0a] dark:text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Email *</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full rounded border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none dark:border-[#333] dark:bg-[#0a0a0a] dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Current Title</label>
                  <input
                    value={currentTitle}
                    onChange={(e) => setCurrentTitle(e.target.value)}
                    className="w-full rounded border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none dark:border-[#333] dark:bg-[#0a0a0a] dark:text-white"
                  />
                </div>
                {createCandidate.isError && (
                  <p className="text-xs text-red-400">Failed to add candidate. Please try again.</p>
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
                    disabled={createCandidate.isPending}
                    className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {createCandidate.isPending ? 'Adding...' : 'Add Candidate'}
                  </button>
                </div>
              </form>
            </Modal>
          )}

          {/* Stage filter */}
          {selectedJobId && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {STAGES.map((s) => (
                <button
                  key={s}
                  onClick={() => setSelectedStage(s)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    selectedStage === s
                      ? 'bg-brand-600 text-white'
                      : 'border border-gray-300 text-gray-500 hover:text-gray-900 dark:border-[#333] dark:text-gray-400 dark:hover:text-white'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Candidates */}
          {candidatesLoading ? (
            <div className="flex h-32 items-center justify-center">
              <LoadingSpinner />
            </div>
          ) : selectedJobId ? (
            <TableShell>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Title / Company</Th>
                  <Th>Location</Th>
                  <Th>Skills</Th>
                  <Th>Stage</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <Tr key={c._id} onClick={() => navigate(`/candidates/${c._id}`)}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-900 dark:bg-[#1a1a1a] dark:text-white">
                          {c.firstName.charAt(0)}
                        </div>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {c.firstName} {c.lastName}
                        </span>
                      </div>
                    </Td>
                    <Td className="text-gray-500 dark:text-gray-400">
                      {c.currentTitle} {c.currentCompany && `@ ${c.currentCompany}`}
                    </Td>
                    <Td className="text-gray-500 dark:text-gray-400">{c.location || '—'}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {c.skills.slice(0, 3).map((s) => (
                          <span key={s} className="rounded bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 dark:bg-[#1a1a1a] dark:text-gray-400">
                            {s}
                          </span>
                        ))}
                      </div>
                    </Td>
                    <Td>
                      <StageBadge stage={c.stage} />
                    </Td>
                  </Tr>
                ))}
                {filtered.length === 0 && <EmptyRow colSpan={5}>No candidates in this stage.</EmptyRow>}
              </tbody>
            </TableShell>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white p-12 text-center dark:border-[#222] dark:bg-[#111]">
              <p className="text-sm text-gray-500 dark:text-gray-400">Select a role above to view candidates.</p>
            </div>
          )}
        </>
      )}
    </AppLayout>
  );
}
