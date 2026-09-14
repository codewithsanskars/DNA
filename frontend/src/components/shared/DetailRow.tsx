import { ReactNode } from 'react';

interface DetailRowProps {
  label: string;
  children: ReactNode;
}

/** Label / value pair for use inside a `<dl>` (org profile, job details, …). */
export default function DetailRow({ label, children }: DetailRowProps) {
  return (
    <div>
      <dt className="text-2xs font-semibold uppercase tracking-wide text-subtle-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
    </div>
  );
}
