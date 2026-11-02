import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import IconButton from '../shared/IconButton';
import NotificationBell from './NotificationBell';
import UserMenu from './UserMenu';
import Icon from '../shared/Icon';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onMenuClick: () => void;
  /** Path to return to. When set, a back button appears before the title. */
  backTo?: string;
  backLabel?: string;
}

export default function Header({ title, subtitle, onMenuClick, backTo, backLabel }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  return (
    <header className="z-10 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {/* Mobile: open the navigation drawer */}
        <IconButton
          icon="menu"
          iconSize={18}
          label="Open navigation"
          onClick={onMenuClick}
          className="lg:hidden"
        />

        {backTo && (
          <IconButton
            icon="arrow-left"
            iconSize={16}
            label={backLabel || 'Back'}
            onClick={() => navigate(backTo)}
            className="shrink-0"
          />
        )}

        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold leading-tight text-foreground">{title}</h1>
          {subtitle && (
            <p className="truncate text-xs leading-tight text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event('swfs:open-command-palette'))}
          className="hidden h-8 items-center gap-2 rounded-md border border-border-strong px-2.5 text-xs text-subtle-foreground transition-colors hover:bg-muted hover:text-foreground md:flex"
          aria-label="Open command palette"
        >
          <Icon name="search" size={13} />
          <span className="pr-6">Search…</span>
          <kbd className="rounded border border-border px-1 text-2xs">{/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K'}</kbd>
        </button>
        <NotificationBell />

        <IconButton
          icon={theme === 'dark' ? 'sun' : 'moon'}
          iconSize={15}
          label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={toggleTheme}
        />

        <UserMenu />
      </div>
    </header>
  );
}
