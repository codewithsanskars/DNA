import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AppLayout from '../components/layout/AppLayout';
import { StageBadge } from '../components/shared/Badge';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import Card from '../components/shared/Card';
import { candidateApi } from '../api/candidate.api';
import { useAuth } from '../hooks/useAuth';

const CAN_ACT_ROLES = ['SWFS_ADMIN', 'CLIENT_ADMIN', 'HIRING_MANAGER'];

export default function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canAct = CAN_ACT_ROLES.includes(user?.role || '');

  const [feedback, setFeedback] = useState('');
  const [rating, setRating] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);

  const { data: candidate, isLoading } = useQuery({
    queryKey: ['candidate', id],
    queryFn: () => candidateApi.getCandidate(id!),
    enabled: !!id,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['candidate', id] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const shortlist = useMutation({
    mutationFn: () => candidateApi.shortlist(id!),
    onSuccess: invalidate,
  });

  const reject = useMutation({
    mutationFn: () => candidateApi.reject(id!),
    onSuccess: invalidate,
  });

  const requestInterview = useMutation({
    mutationFn: () => candidateApi.requestInterview(id!, { notes: 'Interview requested via portal' }),
    onSuccess: invalidate,
  });

  const submitFeedback = useMutation({
    mutationFn: () => candidateApi.submitFeedback(id!, feedback, rating || undefined),
    onSuccess: () => {
      setShowFeedback(false);
      setFeedback('');
      setRating(0);
      invalidate();
    },
  });

  if (isLoading) {
    return (
      <AppLayout title="Candidate">
        <div className="flex h-64 items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      </AppLayout>
    );
  }

  if (!candidate) {
    return (
      <AppLayout title="Candidate">
        <p className="text-red-400">Candidate not found.</p>
      </AppLayout>
    );
  }

  const fullName = `${candidate.firstName} ${candidate.lastName}`;

  return (
    <AppLayout title={fullName} subtitle={candidate.currentTitle || 'Candidate'}>
      <button
        onClick={() => navigate(-1)}
        className="mb-4 text-xs text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
      >
        ← Back
      </button>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main profile */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-xl font-bold text-blue-600 dark:bg-blue-600/20 dark:text-blue-400">
                  {candidate.firstName.charAt(0)}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{fullName}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {candidate.currentTitle} {candidate.currentCompany && `@ ${candidate.currentCompany}`}
                  </p>
                  <div className="mt-1 flex gap-3 text-xs text-gray-500">
                    {candidate.location && <span>📍 {candidate.location}</span>}
                    {candidate.email && <span>✉ {candidate.email}</span>}
                  </div>
                </div>
              </div>
              <StageBadge stage={candidate.stage} />
            </div>

            {/* Skills */}
            {candidate.skills.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {candidate.skills.map((s) => (
                    <span key={s} className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 dark:bg-[#1a1a1a] dark:text-gray-300">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Links */}
            <div className="mt-4 flex gap-3">
              {candidate.linkedinUrl && (
                <a
                  href={candidate.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                >
                  LinkedIn →
                </a>
              )}
              {candidate.resumeUrl && (
                <a
                  href={candidate.resumeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                >
                  Resume →
                </a>
              )}
            </div>
          </Card>

          {/* Feedback form */}
          {canAct && (
            <Card>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Feedback</h3>
                {!showFeedback && (
                  <button
                    onClick={() => setShowFeedback(true)}
                    className="text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                  >
                    + Add feedback
                  </button>
                )}
              </div>
              {showFeedback && (
                <div className="mt-3 space-y-3">
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Share your thoughts on this candidate..."
                    rows={3}
                    className="w-full rounded border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 resize-none dark:border-[#333] dark:bg-[#0a0a0a] dark:text-white dark:placeholder-gray-600 dark:focus:border-blue-600"
                  />
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Rating:</span>
                    {[1, 2, 3, 4, 5].map((r) => (
                      <button
                        key={r}
                        onClick={() => setRating(r)}
                        className={`text-base ${r <= rating ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'}`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => submitFeedback.mutate()}
                      disabled={!feedback || submitFeedback.isPending}
                      className="rounded bg-brand-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      {submitFeedback.isPending ? 'Submitting...' : 'Submit'}
                    </button>
                    <button
                      onClick={() => setShowFeedback(false)}
                      className="rounded border border-gray-300 px-4 py-1.5 text-xs text-gray-500 hover:text-gray-900 dark:border-[#333] dark:text-gray-400 dark:hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {candidate.clientRating && !showFeedback && (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Rating: {'★'.repeat(candidate.clientRating)}{'☆'.repeat(5 - candidate.clientRating)}
                </p>
              )}
            </Card>
          )}
        </div>

        {/* Actions panel */}
        {canAct && (
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Actions</h3>
            <div className="space-y-2">
              <button
                onClick={() => shortlist.mutate()}
                disabled={shortlist.isPending || candidate.stage === 'SHORTLISTED'}
                className="w-full rounded-lg border border-purple-300 bg-purple-50 px-4 py-3 text-left text-sm text-purple-700 hover:bg-purple-100 disabled:opacity-40 transition-colors dark:border-purple-700/50 dark:bg-purple-900/20 dark:text-purple-300 dark:hover:bg-purple-900/40"
              >
                <span className="font-medium">Shortlist</span>
                <p className="mt-0.5 text-xs text-purple-500">Mark as a top candidate</p>
              </button>

              <button
                onClick={() => requestInterview.mutate()}
                disabled={requestInterview.isPending || candidate.stage === 'INTERVIEW'}
                className="w-full rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-left text-sm text-red-700 hover:bg-red-100 disabled:opacity-40 transition-colors dark:border-brand-700/50 dark:bg-brand-900/20 dark:text-brand-300 dark:hover:bg-brand-900/40"
              >
                <span className="font-medium">Request Interview</span>
                <p className="mt-0.5 text-xs text-brand-500">Schedule an interview</p>
              </button>

              <button
                onClick={() => reject.mutate()}
                disabled={reject.isPending || candidate.stage === 'REJECTED'}
                className="w-full rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-left text-sm text-red-600 hover:bg-red-100 disabled:opacity-40 transition-colors dark:border-red-800/50 dark:bg-red-900/10 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                <span className="font-medium">Reject</span>
                <p className="mt-0.5 text-xs text-red-600">Remove from consideration</p>
              </button>
            </div>

            {/* Stage info */}
            <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3 dark:border-[#222] dark:bg-[#111]">
              <p className="text-xs text-gray-500 dark:text-gray-400">Current Stage</p>
              <div className="mt-1">
                <StageBadge stage={candidate.stage} />
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
