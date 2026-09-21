import { useEffect, useState } from 'react';
import { initials } from '../../utils/format';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Record<AvatarSize, string> = {
  xs: 'h-7 w-7 text-2xs',
  sm: 'h-8 w-8 text-[13px]',
  md: 'h-9 w-9 text-[13px]',
  lg: 'h-14 w-14 text-lg',
  xl: 'h-24 w-24 text-3xl',
};

interface AvatarProps {
  /** Name or email — the first character becomes the monogram. */
  name?: string | null;
  size?: AvatarSize;
  title?: string;
  className?: string;
  /** Shown instead of the monogram when it loads — e.g. an org's logo. Falls back to the monogram on error. */
  imageUrl?: string | null;
}

/** Circular monogram (or image, when given one) used for people and organizations across the portal. */
export default function Avatar({ name, size = 'sm', title, className = '', imageUrl }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [imageUrl]);
  const showImage = !!imageUrl && !failed;

  return (
    <div
      title={title}
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-semibold text-foreground ring-1 ring-inset ring-border ${SIZES[size]} ${className}`}
    >
      {showImage ? (
        <img src={imageUrl!} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        initials(name)
      )}
    </div>
  );
}
