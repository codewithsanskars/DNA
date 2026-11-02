import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useChartTheme } from './chartTheme';
import { ChartTooltip } from './Widgets';
import { humanize } from '../../utils/format';
import { SOURCE_LABELS, REJECTION_LABELS } from '../../utils/labels';
import { CandidateSource, CandidateStage, DashboardInsights, RejectionReason } from '../../types';

const TICK = { fontSize: 11 };

/**
 * Conversion funnel (Ashby / Greenhouse style): candidates who reached each
 * stage, with stage-to-stage conversion. Each row is a button.
 */
export function FunnelChart({ data, onSelect }: { data: DashboardInsights['funnel']; onSelect: (stage: CandidateStage) => void }) {
  const t = useChartTheme();
  const max = Math.max(1, ...data.map((d) => d.reached));
  return (
    <div className="space-y-0.5">
      {data.map((row, i) => (
        <div key={row.stage}>
          {i > 0 && (
            <p className="py-0.5 pl-[6.75rem] text-2xs tabular-nums text-subtle-foreground">
              ↓ {row.conversion != null ? `${row.conversion}%` : '—'} convert
            </p>
          )}
          <button
            type="button"
            onClick={() => onSelect(row.stage)}
            title={`${row.reached} reached ${humanize(row.stage)} · ${row.current} there now — click to see them`}
            className="group flex w-full items-center gap-3 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted"
          >
            <span className="w-24 shrink-0 text-xs font-medium text-muted-foreground group-hover:text-foreground">{humanize(row.stage)}</span>
            <span className="relative h-6 flex-1">
              <span
                className="absolute inset-y-0 left-0 rounded-[4px] transition-[width,filter] duration-700 group-hover:brightness-110"
                style={{ width: `${Math.max(2, (row.reached / max) * 100)}%`, background: t.series[0], opacity: 1 - i * 0.08 }}
              />
            </span>
            <span className="w-20 shrink-0 text-right text-xs tabular-nums">
              <span className="font-semibold text-foreground">{row.reached}</span>
              <span className="text-subtle-foreground"> · {row.current} now</span>
            </span>
          </button>
        </div>
      ))}
    </div>
  );
}

/** Weekly activity: new applications, submissions to clients, hires (last 12 weeks). */
export function TrendChart({ data }: { data: DashboardInsights['trend'] }) {
  const t = useChartTheme();
  const rows = data.map((d) => ({
    ...d,
    label: new Date(`${d.week}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={rows} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
        <defs>
          {t.series.slice(0, 3).map((c, i) => (
            <linearGradient key={c} id={`trend-${i}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={c} stopOpacity={0.28} />
              <stop offset="100%" stopColor={c} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} stroke={t.grid} />
        <XAxis dataKey="label" tick={{ ...TICK, fill: t.axis }} tickLine={false} axisLine={{ stroke: t.grid }} minTickGap={18} />
        <YAxis allowDecimals={false} tick={{ ...TICK, fill: t.axis }} tickLine={false} axisLine={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: t.axis, strokeDasharray: '3 3' }} />
        <Legend iconType="plainline" iconSize={12} wrapperStyle={{ fontSize: 11, color: t.axis }} />
        <Area type="monotone" dataKey="added" name="New applications" stroke={t.series[0]} strokeWidth={2} fill="url(#trend-0)" activeDot={{ r: 4 }} />
        <Area type="monotone" dataKey="submitted" name="Submitted to client" stroke={t.series[1]} strokeWidth={2} fill="url(#trend-1)" activeDot={{ r: 4 }} />
        <Area type="monotone" dataKey="hired" name="Hired" stroke={t.series[2]} strokeWidth={2} fill="url(#trend-2)" activeDot={{ r: 4 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Candidate sources with hire rate; slices and legend rows are clickable. */
export function SourcesDonut({ data, onSelect }: { data: DashboardInsights['sources']; onSelect?: (source: CandidateSource) => void }) {
  const t = useChartTheme();
  // Fixed slot order; everything past the 3rd source folds into "Other".
  const top = data.slice(0, 3);
  const rest = data.slice(3);
  const rows = [
    ...top.map((d) => ({ key: d.source, name: SOURCE_LABELS[d.source as CandidateSource] ?? d.source, count: d.count, hired: d.hired })),
    ...(rest.length ? [{ key: 'OTHER_GROUP', name: 'Other', count: rest.reduce((s, d) => s + d.count, 0), hired: rest.reduce((s, d) => s + d.hired, 0) }] : []),
  ];
  const total = rows.reduce((s, r) => s + r.count, 0);
  const multi = rows.filter((r) => r.count).length > 1;
  const pick = (key: string) => key !== 'OTHER_GROUP' && onSelect?.(key as CandidateSource);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-40 w-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={rows}
              dataKey="count"
              nameKey="name"
              innerRadius="64%"
              outerRadius="100%"
              paddingAngle={multi ? 2 : 0}
              stroke={t.surface}
              strokeWidth={multi ? 2 : 0}
              onClick={(_, i) => pick(rows[i].key)}
              style={{ cursor: onSelect ? 'pointer' : undefined }}
            >
              {rows.map((r, i) => (
                <Cell key={r.key} fill={r.key === 'OTHER_GROUP' ? t.muted : t.series[i]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold text-foreground">{total}</span>
          <span className="text-2xs text-subtle-foreground">candidates</span>
        </div>
      </div>
      <ul className="w-full space-y-1">
        {rows.map((r, i) => (
          <li key={r.key}>
            <button
              type="button"
              onClick={() => pick(r.key)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted"
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: r.key === 'OTHER_GROUP' ? t.muted : t.series[i] }} />
              <span className="flex-1 text-xs text-foreground">{r.name}</span>
              <span className="text-xs font-semibold tabular-nums text-foreground">{r.count}</span>
              <span className="w-16 text-right text-2xs tabular-nums text-subtle-foreground">
                {r.count ? Math.round((r.hired / r.count) * 100) : 0}% hired
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Median days candidates have sat in each stage; stalled threshold marked. */
export function TimeInStageChart({
  data,
  onSelect,
  stalledDays = 14,
}: {
  data: DashboardInsights['timeInStage'];
  onSelect: (stage: CandidateStage) => void;
  stalledDays?: number;
}) {
  const t = useChartTheme();
  const rows = data.map((d) => ({ ...d, name: humanize(d.stage) }));
  if (!rows.length) return <p className="py-12 text-center text-xs text-muted-foreground">No active candidates.</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(150, rows.length * 34 + 30)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 12, right: 28, left: 4, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke={t.grid} />
        <XAxis type="number" unit="d" tick={{ ...TICK, fill: t.axis }} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={82} tick={{ ...TICK, fill: t.axis }} tickLine={false} axisLine={false} />
        <ReferenceLine x={stalledDays} stroke={t.series[1]} strokeDasharray="3 3" label={{ value: `${stalledDays}d`, position: 'top', fontSize: 10, fill: t.axis }} />
        <Tooltip
          cursor={{ fill: t.grid, opacity: 0.5 }}
          content={({ active, payload, label }) => (
            <ChartTooltip
              active={active}
              label={label as string}
              payload={payload?.map((p) => ({
                name: `median · ${(p.payload as { count: number }).count} candidates`,
                value: Number(p.value),
                color: t.series[0],
              }))}
              format={(v) => `${v} days`}
              hint="Click to see them"
            />
          )}
        />
        <Bar
          dataKey="medianDays"
          radius={[0, 4, 4, 0]}
          maxBarSize={16}
          style={{ cursor: 'pointer' }}
          onClick={(d) => onSelect((d as unknown as { stage: CandidateStage }).stage)}
        >
          {rows.map((r) => (
            <Cell key={r.stage} fill={(r.medianDays ?? 0) >= stalledDays ? t.series[1] : t.series[0]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Horizontal bars for a ranked breakdown (rejection reasons, etc.). */
export function RankBars({
  rows,
  onSelect,
  color,
}: {
  rows: { key: string; label: string; value: number; sub?: string }[];
  onSelect?: (key: string) => void;
  color?: string;
}) {
  const t = useChartTheme();
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-10 text-center text-xs text-muted-foreground">Nothing to show yet.</p>;
  return (
    <ul className="space-y-1">
      {rows.map((r) => {
        const Tag = onSelect ? 'button' : 'div';
        return (
          <li key={r.key}>
            <Tag
              type={onSelect ? 'button' : undefined}
              onClick={onSelect ? () => onSelect(r.key) : undefined}
              className={`group flex w-full items-center gap-3 rounded-md px-1.5 py-1.5 text-left ${onSelect ? 'transition-colors hover:bg-muted' : ''}`}
            >
              <span className="w-36 shrink-0 truncate text-xs text-muted-foreground group-hover:text-foreground">{r.label}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full transition-all duration-700" style={{ width: `${(r.value / max) * 100}%`, background: color ?? t.series[0] }} />
              </span>
              <span className="w-20 shrink-0 text-right text-xs tabular-nums">
                <span className="font-semibold text-foreground">{r.value.toLocaleString()}</span>
                {r.sub && <span className="text-subtle-foreground"> {r.sub}</span>}
              </span>
            </Tag>
          </li>
        );
      })}
    </ul>
  );
}

export const rejectionLabel = (r: string) => REJECTION_LABELS[r as RejectionReason] ?? 'Not specified';
