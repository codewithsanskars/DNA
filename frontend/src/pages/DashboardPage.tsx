import { ReactNode, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import { StatCard } from '../components/shared/Card';
import Button from '../components/shared/Button';
import DragWidget from '../components/shared/DragWidget';
import { CenteredSpinner } from '../components/shared/LoadingSpinner';
import { ErrorState, EmptyState } from '../components/shared/States';
import Icon from '../components/shared/Icon';
import { dashboardApi } from '../api/dashboard.api';
import { queryKeys } from '../api/queryKeys';
import { useAuth } from '../context/AuthContext';
import { useReorderable } from '../hooks/useReorderable';
import { isAdminRole } from '../utils/roles';
import { humanize, timeAgo } from '../utils/format';
import { CandidateStage, DashboardSummary } from '../types';

const STAGE_ORDER: CandidateStage[] = [
  'APPLIED',
  'SCREENING',
  'INTERVIEW',
  'SHORTLISTED',
  'OFFER',
  'HIRED',
  'REJECTED',
];

type StatKey =
  | 'openJobs'
  | 'totalCandidates'
  | 'shortlisted'
  | 'inInterview'
  | 'selected'
  | 'avgBillRate'
  | 'totalBillRate'
  | 'onboarded'
  | 'offersAccepted'
  | 'totalMonthlyBilling'
  | 'totalPayRate'
  | 'avgPayRate'
  | 'totalGrossMargin';

const STAT_DEFS: Record<StatKey, { label: string; emphasis?: boolean }> = {
  openJobs: { label: 'Open Roles' },
  totalCandidates: { label: 'Candidates' },
  shortlisted: { label: 'Shortlisted' },
  inInterview: { label: 'In Interview' },
  selected: { label: 'Selected', emphasis: true },
  avgBillRate: { label: 'Avg. Bill Rate' },
  totalBillRate: { label: 'Total Bill Rate' },
  onboarded: { label: 'Onboarded' },
  offersAccepted: { label: 'Offer Accepted' },
  totalMonthlyBilling: { label: 'Total Monthly Billing', emphasis: true },
  totalPayRate: { label: 'Total Pay Rate' },
  avgPayRate: { label: 'Avg. Pay Rate' },
  totalGrossMargin: { label: 'Total Gross Margin', emphasis: true },
};
const DEFAULT_STAT_ORDER: StatKey[] = ['openJobs', 'totalCandidates', 'shortlisted', 'inInterview', 'selected'];

// Client- and admin-only KPIs. Not yet backed by real data — placeholder
// values until the backend computes these from actual billing/pay records.
const CLIENT_ONLY_STAT_ORDER: StatKey[] = [
  'avgBillRate',
  'totalBillRate',
  'onboarded',
  'offersAccepted',
  'totalMonthlyBilling',
];
const ADMIN_ONLY_STAT_ORDER: StatKey[] = [
  'totalBillRate',
  'avgBillRate',
  'totalPayRate',
  'avgPayRate',
  'totalGrossMargin',
];
const CLIENT_STATIC_STAT_VALUES: Partial<Record<StatKey, string | number>> = {
  avgBillRate: '$62/hr',
  totalBillRate: '$1,240/hr',
  onboarded: 8,
  offersAccepted: 5,
  totalMonthlyBilling: '$48,600',
};
const ADMIN_STATIC_STAT_VALUES: Partial<Record<StatKey, string | number>> = {
  totalBillRate: '$18,400/hr',
  avgBillRate: '$74/hr',
  totalPayRate: '$14,200/hr',
  avgPayRate: '$58/hr',
  totalGrossMargin: '$4,200/hr',
};

type SectionKey = 'pipeline' | 'activity';
const SECTION_LABELS: Record<SectionKey, string> = {
  pipeline: 'Candidate Pipeline',
  activity: 'Recent Activity',
};
const DEFAULT_SECTION_ORDER: SectionKey[] = ['pipeline', 'activity'];

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isClient = !isAdminRole(user?.role);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: dashboardApi.getSummary,
  });

  const defaultStatOrder = [
    ...DEFAULT_STAT_ORDER,
    ...(isClient ? CLIENT_ONLY_STAT_ORDER : ADMIN_ONLY_STAT_ORDER),
  ];
  const staticStatValues = isClient ? CLIENT_STATIC_STAT_VALUES : ADMIN_STATIC_STAT_VALUES;
  const stats = useReorderable<StatKey>('swfs_dashboard_stats_order', defaultStatOrder);
  const sections = useReorderable<SectionKey>('swfs_dashboard_sections_order', DEFAULT_SECTION_ORDER);
  const [editMode, setEditMode] = useState(false);

  const isCustomLayout =
    stats.order.join() !== defaultStatOrder.join() || sections.order.join() !== DEFAULT_SECTION_ORDER.join();

  const resetLayout = () => {
    stats.reset();
    sections.reset();
  };

  const firstName = user?.name?.split(' ')[0];

  const renderSection = (key: SectionKey, data: DashboardSummary): ReactNode => {
    if (key === 'pipeline') {
      const max = Math.max(1, ...Object.values(data.pipelineSummary));
      return (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-[13px] font-semibold text-foreground">Candidate Pipeline</h2>
            <button
              onClick={() => navigate('/jobs')}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-text hover:underline"
            >
              View roles <Icon name="arrow-right" size={13} />
            </button>
          </div>
          <div className="space-y-1 p-2.5">
            {STAGE_ORDER.map((stage) => {
              const count = data.pipelineSummary[stage] || 0;
              const pct = (count / max) * 100;
              return (
                <button
                  key={stage}
                  type="button"
                  onClick={() => navigate('/candidates')}
                  title={`${count} candidate${count === 1 ? '' : 's'} in ${humanize(stage)}`}
                  className="group flex w-full items-center gap-4 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted"
                >
                  <span className="w-24 shrink-0 text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                    {humanize(stage)}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted transition-colors group-hover:bg-border">
                    <div
                      className="h-full rounded-full bg-muted-foreground transition-all duration-500 group-hover:bg-brand"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums text-foreground">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xs">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-[13px] font-semibold text-foreground">Recent Activity</h2>
          <button
            onClick={() => navigate('/activity')}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-text hover:underline"
          >
            Full log <Icon name="arrow-right" size={13} />
          </button>
        </div>
        {data.recentActivity.length === 0 ? (
          <EmptyState
            icon="activity"
            title="No activity yet"
            description="Actions across the portal will show up here."
            className="py-12"
          />
        ) : (
          <ul className="flex-1 divide-y divide-border">
            {data.recentActivity.map((log) => (
              <li key={log._id} className="flex gap-3 px-4 py-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                <div className="min-w-0">
                  <p className="text-[13px] text-foreground">{humanize(log.action)}</p>
                  <p className="mt-0.5 truncate text-2xs text-subtle-foreground">
                    {log.userEmail} · {timeAgo(log.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <AppLayout
      title="Dashboard"
      actions={
        <div className="ml-auto flex items-center gap-2">
          {editMode ? (
            <>
              {isCustomLayout && (
                <Button variant="ghost" size="sm" onClick={resetLayout}>
                  Reset layout
                </Button>
              )}
              <Button variant="primary" size="sm" icon="check" onClick={() => setEditMode(false)}>
                Save
              </Button>
            </>
          ) : (
            <Button variant="secondary" size="sm" icon="grip" onClick={() => setEditMode(true)}>
              Edit layout
            </Button>
          )}
        </div>
      }
    >
      {isLoading ? (
        <CenteredSpinner />
      ) : error || !data ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 sm:gap-4">
            {stats.order.map((key, i) => {
              const def = STAT_DEFS[key];
              return (
                <DragWidget
                  key={key}
                  label={def.label}
                  orientation="row"
                  editable={editMode}
                  handleProps={stats.getHandleProps(key)}
                  dropZoneProps={stats.getDropZoneProps(key)}
                  isDragging={stats.isDragging(key)}
                  isDragOver={stats.isDragOver(key)}
                  isFirst={i === 0}
                  isLast={i === stats.order.length - 1}
                  onMoveBack={() => stats.move(key, -1)}
                  onMoveForward={() => stats.move(key, 1)}
                >
                  <StatCard
                    label={def.label}
                    value={staticStatValues[key] ?? (data as unknown as Record<string, number>)[key]}
                    emphasis={def.emphasis}
                  />
                </DragWidget>
              );
            })}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {sections.order.map((key, i) => (
              <DragWidget
                key={key}
                label={SECTION_LABELS[key]}
                orientation="row"
                editable={editMode}
                className={key === 'pipeline' ? 'lg:col-span-2' : ''}
                handleProps={sections.getHandleProps(key)}
                dropZoneProps={sections.getDropZoneProps(key)}
                isDragging={sections.isDragging(key)}
                isDragOver={sections.isDragOver(key)}
                isFirst={i === 0}
                isLast={i === sections.order.length - 1}
                onMoveBack={() => sections.move(key, -1)}
                onMoveForward={() => sections.move(key, 1)}
              >
                {renderSection(key, data)}
              </DragWidget>
            ))}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
