/** Short monogram per platform; falls back to the capitalised first letter. */
const PLATFORM_LABELS: Record<string, string> = {
  linkedin: 'in',
  twitter: '𝕏',
  facebook: 'f',
  instagram: 'ig',
};

interface SocialLinksProps {
  links?: Record<string, string | undefined> | null;
  /** Stop click propagation — needed when rendered inside a clickable row. */
  stopPropagation?: boolean;
  /** Extra classes on the wrapper (e.g. borders / padding). */
  className?: string;
}

/** Row of outbound social buttons for an organization. Renders nothing when empty. */
export default function SocialLinks({ links, stopPropagation, className = '' }: SocialLinksProps) {
  const entries = Object.entries(links ?? {}).filter(([, url]) => !!url) as [string, string][];
  if (entries.length === 0) return null;

  return (
    <div className={`flex gap-1.5 ${className}`}>
      {entries.map(([platform, url]) => (
        <a
          key={platform}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title={platform}
          onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-2xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {PLATFORM_LABELS[platform] || platform.charAt(0).toUpperCase()}
        </a>
      ))}
    </div>
  );
}
