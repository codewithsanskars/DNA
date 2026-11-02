import { ReactNode, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import Button from '../components/shared/Button';
import DragWidget from '../components/shared/DragWidget';
import { CenteredSpinner } from '../components/shared/LoadingSpinner';
import { ErrorState, EmptyState } from '../components/shared/States';
import Icon from '../components/shared/Icon';
import { KpiCard, ChartCard } from '../components/dashboard/Widgets';
import { FunnelChart, TrendChart, SourcesDonut, TimeInStageChart, RankBars, rejectionLabel } from '../components/dashboard/Charts';
import { CandidateListModal, CandidateListSpec, PlacementsModal } from '../components/dashboard/DetailModals';
import { useChartTheme } from '../components/dashboard/chartTheme';
import { dashboardApi } from '../api/dashboard.api';
import { queryKeys } from '../api/queryKeys';
import { useAuth } from '../context/AuthContext';
import { useReorderable } from '../hooks/useReorderable';
import { isAdminRole } from '../utils/roles';
import { humanize, timeAgo } from '../utils/format';
import { formatMoney, SOURCE_LABELS } from '../utils/labels';
import { CandidateSource, CandidateStage, DashboardInsights, DashboardSummary } from '../types';
import ClientHomePage from './ClientHomePage';
import { NewOpeningsCard } from '../components/ai/JobInsights';

type KpiKey =
  | 'openRoles'
  | 'activePipeline'
  | 'awaitingReview'
  | 'inInterview'
  | 'offersOut'
  | 'hired'
  | 'timeToHire'
  | 'rejected'
  | 'monthlyBilling'
  | 'grossMargin';

const KPI_LABELS: Record<KpiKey, string> = {
  openRoles: 'Open roles',
  activePipeline: 'Active pipeline',
  awaitingReview: 'Awaiting client',
  inInterview: 'In interview',
  offersOut: 'Offers out',
  hired: 'Placed',
  timeToHire: 'Time to hire',
  rejected: 'Rejected',
  monthlyBilling: 'Monthly billing',
  grossMargin: 'Gross margin',
};
const DEFAULT_KPIS: KpiKey[] = [
  'openRoles',
  'activePipeline',
  'awaitingReview',
  'inInterview',
  'offersOut',
  'hired',
  'timeToHire',
  'rejected',
  'monthlyBilling',
  'grossMargin',
];

type SectionKey = 'funnel' | 'trend' | 'sources' | 'timeInStage' | 'clients' | 'rejections' | 'activity';
const SECTION_LABELS: Record<SectionKey, string> = {
  funnel: 'Pipeline funnel',
  trend: 'Weekly activity',
  sources: 'Candidate sources',
  timeInStage: 'Time in stage',
  clients: 'Clients',
  rejections: 'Rejection reasons',
  activity: 'Recent activity',
};
const WIDE = new Set<SectionKey>(['funnel', 'trend', 'clients']);
const DEFAULT_SECTIONS: SectionKey[] = ['funnel', 'sources', 'trend', 'timeInStage', 'clients', 'rejections', 'activity'];
const ACTIVE_STAGES = 'APPLIED,SCREENING,SUBMITTED,SHORTLISTED,INTERVIEW,OFFER';

/** Clients land on their own home page; SWFS staff get the dashboard below. */
export default function DashboardPage() {
  const { user } = useAuth();
  return isAdminRole(user?.role) ? <AdminDashboard /> : <ClientHomePage />;
}

/**
 * SWFS dashboard. Every KPI and chart mark is clickable: it either opens the
 * filtered list behind the number (drill-down modal) or navigates to the
 * screen that owns it. Layout is drag-reorderable and saved per browser.
 */
function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const t = useChartTheme();
  const [editMode, setEditMode] = useState(false);
  const [drill, setDrill] = useState<CandidateListSpec | null>(null);
  const [showPlacements, setShowPlacements] = useState(false);

  const insights = useQuery({ queryKey: queryKeys.insights, queryFn: dashboardApi.getInsights, refetchInterval: 60_000 });
  const summary = useQuery({ queryKey: queryKeys.dashboard, queryFn: dashboardApi.getSummary });

  const kpis = useReorderable<KpiKey>('swfs_dashboard_kpis_v3', DEFAULT_KPIS);
  const sections = useReorderable<SectionKey>('swfs_dashboard_sections_v3', DEFAULT_SECTIONS);
  const isCustomLayout = kpis.order.join() !== DEFAULT_KPIS.join() || sections.order.join() !== DEFAULT_SECTIONS.join();

  const openStage = (stage: CandidateStage, title?: string) =>
    setDrill({ title: title ?? `${humanize(stage)}`, stage, fullListPath: '/search?stage=' + stage });

  const renderKpi = (key: KpiKey, d: DashboardInsights): ReactNode => {
    const k = d.kpis;
    switch (key) {
      case 'openRoles':
        return (
          <KpiCard
            label={KPI_LABELS[key]}
            icon="briefcase"
            value={k.openRoles}
            sub={`${k.highPriorityRoles} high priority${k.onHoldRoles ? ` · ${k.onHoldRoles} on hold` : ''}`}
            onClick={() => navigate('/jobs?status=OPEN')}
          />
        );
      case 'activePipeline':
        return (
          <KpiCard
            label={KPI_LABELS[key]}
            icon="users"
            value={k.activePipeline}
            sub="Not yet hired or rejected"
            onClick={() => setDrill({ title: 'Active pipeline', stage: ACTIVE_STAGES, fullListPath: '/candidates' })}
          />
        );
      case 'awaitingReview':
        return (
          <KpiCard
            label={KPI_LABELS[key]}
            icon="inbox"
            value={k.awaitingReview}
            tone={k.awaitingReview ? 'warn' : undefined}
            sub="Submitted, no client decision yet"
            onClick={() => openStage('SUBMITTED', 'Awaiting client review')}
          />
        );
      case 'inInterview':
        return (
          <KpiCard
            label={KPI_LABELS[key]}
            icon="calendar"
            value={k.inInterview}
            sub={`${k.interviewsNext7d} interview${k.interviewsNext7d === 1 ? '' : 's'} in the next 7 days`}
            onClick={() => openStage('INTERVIEW', 'In interview')}
          />
        );
      case 'offersOut':
        return (
          <KpiCard
            label={KPI_LABELS[key]}
            icon="mail"
            value={k.offersOut}
            sub={k.offerAcceptance != null ? `${k.offerAcceptance}% acceptance` : 'No decided offers yet'}
            onClick={() => openStage('OFFER', 'At offer stage')}
          />
        );
      case 'hired':
        return (
          <KpiCard
            label={KPI_LABELS[key]}
            icon="award"
            value={k.hired}
            tone="good"
            sub={`${k.activePlacements} active placement${k.activePlacements === 1 ? '' : 's'}`}
            onClick={() => setShowPlacements(true)}
          />
        );
      case 'timeToHire':
        return (
          <KpiCard
            label={KPI_LABELS[key]}
            icon="clock"
            value={k.avgTimeToHireDays != null ? `${Math.round(k.avgTimeToHireDays)}d` : '—'}
            sub={k.medianTimeToHireDays != null ? `median ${Math.round(k.medianTimeToHireDays)}d · ${k.hiresLast180d} hires (180d)` : 'No hires in 180 days'}
            hint="Average days from application to hire, last 180 days"
            onClick={() => openStage('HIRED', 'Hired candidates')}
          />
        );
      case 'rejected':
        return (
          <KpiCard
            label={KPI_LABELS[key]}
            icon="close"
            value={k.rejected}
            sub={d.rejectionReasons[0] ? `Top: ${rejectionLabel(d.rejectionReasons[0].reason)}` : 'No rejections'}
            onClick={() => openStage('REJECTED', 'Rejected candidates')}
          />
        );
      case 'monthlyBilling':
        return (
          <KpiCard
            label={KPI_LABELS[key]}
            icon="tag"
            tone="brand"
            value={formatMoney(k.monthlyBilling)}
            sub={k.avgBillRate != null ? `avg $${k.avgBillRate}/hr · ${k.activePlacements} active` : 'No active placements with rates'}
            hint="Bill rate × billable hours per month, active placements"
            onClick={() => setShowPlacements(true)}
          />
        );
      case 'grossMargin':
        return (
          <KpiCard
            label={KPI_LABELS[key]}
            icon="activity"
            tone="brand"
            value={formatMoney(k.monthlyMargin ?? 0)}
            sub={k.marginPct != null ? `${k.marginPct}% · $${k.grossMarginPerHour}/hr` : 'Needs bill and pay rates'}
            hint="(Bill − pay) × billable hours per month — internal"
            onClick={() => setShowPlacements(true)}
          />
        );
    }
  };

  const renderSection = (key: SectionKey, d: DashboardInsights, s?: DashboardSummary): ReactNode => {
    switch (key) {
      case 'funnel': {
        const top = d.funnel[0]?.reached ?? 0;
        const hired = d.funnel[d.funnel.length - 1]?.reached ?? 0;
        return (
          <ChartCard
            title="Pipeline funnel"
            description="Candidates who reached each stage and how many convert to the next. Click a stage to see who’s there."
            action={
              <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground">
                {top ? Math.round((hired / top) * 1000) / 10 : 0}% to hire
              </span>
            }
          >
            <FunnelChart data={d.funnel} onSelect={(stage) => openStage(stage)} />
            <button type="button" onClick={() => openStage('REJECTED', 'Rejected candidates')} className="mt-3 text-2xs text-subtle-foreground hover:text-foreground">
              {d.rejected} rejected (not in the funnel) →
            </button>
          </ChartCard>
        );
      }
      case 'trend':
        return (
          <ChartCard title="Weekly activity" description="New applications, submissions to clients and hires — last 12 weeks.">
            <TrendChart data={d.trend} />
          </ChartCard>
        );
      case 'sources':
        return (
          <ChartCard title="Candidate sources" description="Where candidates come from and how often each source hires.">
            <SourcesDonut
              data={d.sources}
              onSelect={(source) =>
                setDrill({ title: `${SOURCE_LABELS[source as CandidateSource] ?? source} candidates`, source, fullListPath: `/search?source=${source}` })
              }
            />
          </ChartCard>
        );
      case 'timeInStage':
        return (
          <ChartCard title="Time in stage" description="Median days candidates have sat in their current stage. Orange = past 14 days.">
            <TimeInStageChart data={d.timeInStage} onSelect={(stage) => openStage(stage, `${humanize(stage)} — longest waiting first`)} />
          </ChartCard>
        );
      case 'clients': {
        const maxPipe = Math.max(1, ...d.groups.map((g) => g.pipeline));
        const maxBill = Math.max(1, ...d.groups.map((g) => g.monthlyBilling ?? 0));
        return (
          <ChartCard title="Clients" description="Ranked by active pipeline. Click a client to open their account.">
            {d.groups.length === 0 ? (
              <EmptyState icon="building" title="No clients with roles yet" className="py-8" />
            ) : (
              <div className="-mx-4 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-2xs uppercase tracking-wide text-subtle-foreground">
                      <th className="px-4 py-2 font-medium">Client</th>
                      <th className="py-2 text-right font-medium">Open</th>
                      <th className="px-3 py-2 font-medium">Pipeline</th>
                      <th className="py-2 text-right font-medium">Submitted</th>
                      <th className="py-2 text-right font-medium">Hires</th>
                      <th className="px-4 py-2 font-medium">Monthly billing</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {d.groups.map((g) => (
                      <tr key={g.id} onClick={() => navigate(`/organization/${g.id}`)} className="cursor-pointer transition-colors hover:bg-muted">
                        <td className="max-w-[180px] truncate px-4 py-2.5 font-medium text-foreground">{g.label}</td>
                        <td className="py-2.5 text-right tabular-nums text-foreground">{g.openRoles}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                              <span className="block h-full rounded-full" style={{ width: `${(g.pipeline / maxPipe) * 100}%`, background: t.series[0] }} />
                            </span>
                            <span className="tabular-nums text-foreground">{g.pipeline}</span>
                          </div>
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-foreground">{g.submitted}</td>
                        <td className="py-2.5 text-right tabular-nums text-foreground">{g.hires}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                              <span className="block h-full rounded-full" style={{ width: `${((g.monthlyBilling ?? 0) / maxBill) * 100}%`, background: t.series[2] }} />
                            </span>
                            <span className="tabular-nums text-foreground">{formatMoney(g.monthlyBilling ?? 0)}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ChartCard>
        );
      }
      case 'rejections':
        return (
          <ChartCard title="Rejection reasons" description="Why candidates were turned down. Click a reason to see the list.">
            <RankBars
              color={t.series[1]}
              rows={d.rejectionReasons.map((r) => ({ key: r.reason, label: rejectionLabel(r.reason), value: r.count }))}
              onSelect={() => openStage('REJECTED', 'Rejected candidates')}
            />
          </ChartCard>
        );
      case 'activity': {
        const logs = s?.recentActivity ?? [];
        return (
          <ChartCard
            title="Recent activity"
            action={
              <button onClick={() => navigate('/activity')} className="inline-flex items-center gap-1 text-xs font-medium text-brand-text hover:underline">
                Full log <Icon name="arrow-right" size={13} />
              </button>
            }
          >
            {logs.length === 0 ? (
              <EmptyState icon="activity" title="No activity yet" className="py-6" />
            ) : (
              <ul className="-my-1 divide-y divide-border">
                {logs.map((log) => (
                  <li key={log._id}>
                    <button
                      type="button"
                      onClick={() =>
                        navigate(
                          log.entityType === 'candidate'
                            ? `/candidates/${log.entityId}`
                            : log.entityType === 'job'
                              ? `/jobs/${log.entityId}`
                              : log.entityType === 'organization'
                                ? `/organization/${log.entityId}`
                                : '/activity'
                        )
                      }
                      className="flex w-full gap-3 rounded-md py-2.5 text-left hover:bg-muted"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                      <div className="min-w-0">
                        <p className="text-[13px] text-foreground">{humanize(log.action)}</p>
                        <p className="mt-0.5 truncate text-2xs text-subtle-foreground">
                          {log.userEmail} · {timeAgo(log.createdAt)}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </ChartCard>
        );
      }
    }
  };

  const firstName = user?.name?.split(' ')[0];

  return (
    <AppLayout
      title="Dashboard"
      actions={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{firstName ? `Welcome back, ${firstName}` : 'Welcome back'}</h2>
            <p className="text-xs text-muted-foreground">
              Across every client{insights.data ? ` · updated ${timeAgo(insights.data.generatedAt)}` : ''} · click any card or chart for details
            </p>
          </div>
          <div className="flex items-center gap-2">
            {editMode ? (
              <>
                {isCustomLayout && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      kpis.reset();
                      sections.reset();
                    }}
                  >
                    Reset layout
                  </Button>
                )}
                <Button variant="primary" size="sm" icon="check" onClick={() => setEditMode(false)}>
                  Done
                </Button>
              </>
            ) : (
              <Button variant="secondary" size="sm" icon="grip" onClick={() => setEditMode(true)}>
                Edit layout
              </Button>
            )}
          </div>
        </div>
      }
    >
      {insights.isLoading ? (
        <CenteredSpinner />
      ) : insights.error || !insights.data ? (
        <ErrorState onRetry={() => insights.refetch()} />
      ) : (
        <div className={`space-y-6 transition-opacity ${insights.isFetching ? 'opacity-80' : ''}`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {kpis.order.map((key, i) => (
              <DragWidget
                key={key}
                label={KPI_LABELS[key]}
                orientation="row"
                editable={editMode}
                handleProps={kpis.getHandleProps(key)}
                dropZoneProps={kpis.getDropZoneProps(key)}
                isDragging={kpis.isDragging(key)}
                isDragOver={kpis.isDragOver(key)}
                isFirst={i === 0}
                isLast={i === kpis.order.length - 1}
                onMoveBack={() => kpis.move(key, -1)}
                onMoveForward={() => kpis.move(key, 1)}
              >
                {renderKpi(key, insights.data!)}
              </DragWidget>
            ))}
          </div>

          <NewOpeningsCard />

          <div className="grid gap-4 lg:grid-cols-3">
            {sections.order.map((key, i) => (
              <DragWidget
                key={key}
                label={SECTION_LABELS[key]}
                orientation="row"
                editable={editMode}
                className={WIDE.has(key) ? 'lg:col-span-2' : ''}
                handleProps={sections.getHandleProps(key)}
                dropZoneProps={sections.getDropZoneProps(key)}
                isDragging={sections.isDragging(key)}
                isDragOver={sections.isDragOver(key)}
                isFirst={i === 0}
                isLast={i === sections.order.length - 1}
                onMoveBack={() => sections.move(key, -1)}
                onMoveForward={() => sections.move(key, 1)}
              >
                {renderSection(key, insights.data!, summary.data)}
              </DragWidget>
            ))}
          </div>
        </div>
      )}

      {drill && <CandidateListModal spec={drill} onClose={() => setDrill(null)} />}
      {showPlacements && <PlacementsModal isAdmin onClose={() => setShowPlacements(false)} />}
    </AppLayout>
  );
}
