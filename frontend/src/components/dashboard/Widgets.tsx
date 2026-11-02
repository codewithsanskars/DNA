import { ReactNode } from 'react';
import Icon, { IconName } from '../shared/Icon';

/** Clickable KPI tile: label, big value, context line, and an affordance on hover. */
export function KpiCard({
  label,
  value,
  sub,
  icon,
  tone,
  hint,
  onClick,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: IconName;
  tone?: 'brand' | 'good' | 'warn';
  hint?: string;
  onClick?: () => void;
}) {
  const valueCls = tone === 'brand' ? 'text-brand-text' : tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-foreground';
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={hint}
      className={`group flex h-full w-full flex-col rounded-lg border border-border bg-card p-4 text-left shadow-xs transition-all ${
        onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md focus-visible:-translate-y-0.5' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xs font-medium uppercase tracking-wide text-subtle-foreground">{label}</p>
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-subtle-foreground ring-1 ring-inset ring-border transition-colors group-hover:text-foreground">
          <Icon name={icon} size={13} />
        </span>
      </div>
      <p className={`mt-2 text-[26px] font-semibold leading-none tabular-nums ${valueCls}`}>{value}</p>
      <div className="mt-auto flex items-end justify-between gap-2 pt-2">
        <p className="truncate text-2xs text-muted-foreground">{sub}</p>
        {onClick && <Icon name="arrow-right" size={12} className="shrink-0 text-subtle-foreground opacity-0 transition-opacity group-hover:opacity-100" />}
      </div>
    </Tag>
  );
}

/** Card frame for a chart, with title, one-line definition and optional action. */
export function ChartCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xs">
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-2xs text-subtle-foreground">{description}</p>}
        </div>
        {action}
      </header>
      <div className="flex-1 p-4">{children}</div>
    </section>
  );
}

/** Tooltip body: value first, label second, series keyed by a short line. */
export function ChartTooltip({
  active,
  label,
  payload,
  format = (v: number) => v.toLocaleString(),
  hint,
}: {
  active?: boolean;
  label?: string;
  payload?: { name: string; value: number; color?: string }[];
  format?: (v: number) => string;
  hint?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="pointer-events-none min-w-[140px] rounded-md border border-border bg-card px-3 py-2 shadow-md">
      {label && <p className="mb-1 text-2xs font-medium text-subtle-foreground">{label}</p>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 py-0.5">
          <span className="h-0.5 w-3 rounded-full" style={{ background: p.color }} />
          <span className="text-[13px] font-semibold tabular-nums text-foreground">{format(Number(p.value))}</span>
          <span className="text-2xs text-muted-foreground">{p.name}</span>
        </div>
      ))}
      {hint && <p className="mt-1 text-2xs text-subtle-foreground">{hint}</p>}
    </div>
  );
}
