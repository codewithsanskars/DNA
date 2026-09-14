import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  /** Adds default padding. Set false when composing with CardHeader / CardBody. */
  padded?: boolean;
  onClick?: () => void;
}

export default function Card({ children, className = '', padded = true, onClick }: CardProps) {
  const interactive = !!onClick;
  return (
    <div
      className={`rounded-lg border border-border bg-card shadow-xs ${padded ? 'p-4' : ''} ${
        interactive ? 'cursor-pointer transition-colors duration-150 hover:border-border-strong' : ''
      } ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  action,
  className = '',
}: {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 border-b border-border px-4 py-3 ${className}`}>
      <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
      {action}
    </div>
  );
}

export function CardBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}

interface StatCardProps {
  label: string;
  value: number | string;
  sub?: string;
  emphasis?: boolean;
}

export function StatCard({ label, value, sub, emphasis }: StatCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
      <p className="text-xs font-medium uppercase tracking-wide text-subtle-foreground">{label}</p>
      <p
        className={`mt-2 text-[26px] font-semibold leading-none tabular-nums ${
          emphasis ? 'text-brand-text' : 'text-foreground'
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
