import { ButtonHTMLAttributes, forwardRef } from 'react';
import Icon, { IconName } from './Icon';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  /** Accessible label — also used as the tooltip. */
  label: string;
  iconSize?: number;
  variant?: 'outline' | 'ghost';
  /** Renders a persistent "on" treatment (e.g. a toggle that's active). */
  active?: boolean;
}

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, iconSize = 16, variant = 'outline', active = false, className = '', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      className={[
        'flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground',
        'transition-[transform,background-color,border-color,color] duration-150',
        'hover:bg-muted hover:text-foreground hover:border-border-strong',
        'active:scale-[0.92] active:bg-border',
        variant === 'outline' ? 'border border-border-strong' : 'border border-transparent',
        active ? 'bg-muted text-foreground' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      <Icon name={icon} size={iconSize} />
    </button>
  );
});

export default IconButton;
