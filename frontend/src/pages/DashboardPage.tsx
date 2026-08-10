import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import { StatCard } from '../components/shared/Card';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import { dashboardApi } from '../api/dashboard.api';
import { useAuth } from '../hooks/useAuth';
import { CandidateStage } from '../types';

const STAGE_ORDER: CandidateStage[] = ['APPLIED', 'SCREENING', 'INTERVIEW', 'SHORTLISTED', 'OFFER', 'HIRED', 'REJECTED'];

const STAGE_COLORS: Record<CandidateStage, string> = {
  APPLIED: 'bg-gray-700',
  SCREENING: 'bg-yellow-700',
  INTERVIEW: 'bg-blue-700',
  SHORTLISTED: 'bg-purple-700',
  OFFER: 'bg-orange-700',
  HIRED: 'bg-green-700',
  REJECTED: 'bg-red-800',
};

function formatAction(action: string) {
  return action.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: dashboardApi.getSummary,
  });

  if (isLoading) {
    return (
      <AppLayout title="Dashboard">
        <div className="flex h-64 items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      </AppLayout>
    );
  }

  if (error || !data) {
    return (
      <AppLayout title="Dashboard">
        <p className="text-red-400">Failed to load dashboard data.</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Dashboard"
      subtitle={`Welcome back, ${user?.name?.split(' ')[0]}`}
    >
      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatCard label="Open Roles" value={data.openJobs} />
        <StatCard label="Total Candidates" value={data.totalCandidates} />
        <StatCard label="Shortlisted" value={data.shortlisted} />
        <StatCard label="In Interview" value={data.inInterview} />
        <StatCard label="Selected" value={data.selected} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Pipeline */}
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Candidate Pipeline</h2>
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-[#222] dark:bg-[#111]">
            <div className="space-y-3">
              {STAGE_ORDER.map((stage) => {
                const count = data.pipelineSummary[stage] || 0;
                const max = Math.max(...Object.values(data.pipelineSummary));
                const pct = max > 0 ? (count / max) * 100 : 0;
                return (
                  <div key={stage} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-xs text-gray-500 dark:text-gray-400">{stage.replace('_', ' ')}</span>
                    <div className="flex-1 rounded-full bg-gray-100 dark:bg-[#1a1a1a]" style={{ height: '6px' }}>
                      <div
                        className={`h-full rounded-full ${STAGE_COLORS[stage]} transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-6 text-right text-xs font-medium text-gray-900 dark:text-white">{count}</span>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => navigate('/jobs')}
              className="mt-4 text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
            >
              View all roles →
            </button>
          </div>
        </div>

        {/* Recent activity */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Recent Activity</h2>
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-[#222] dark:bg-[#111]">
            {data.recentActivity.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">No activity yet.</p>
            ) : (
              <div className="space-y-3">
                {data.recentActivity.map((log) => (
                  <div key={log._id} className="flex gap-3">
                    <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    <div>
                      <p className="text-xs text-gray-900 dark:text-white">{formatAction(log.action)}</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">
                        {log.userEmail} · {timeAgo(log.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => navigate('/activity')}
              className="mt-4 text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
            >
              View full log →
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
