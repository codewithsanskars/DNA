export default function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-4 w-4 border-2', md: 'h-7 w-7 border-2', lg: 'h-9 w-9 border-[3px]' };
  return (
    <div
      className={`${sizes[size]} animate-spin rounded-full border-border-strong border-t-brand`}
      role="status"
      aria-label="Loading"
    />
  );
}

export function CenteredSpinner({ label }: { label?: string }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3">
      <LoadingSpinner size="lg" />
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
    </div>
  );
}
