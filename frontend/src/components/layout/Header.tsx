import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { RoleBadge } from '../shared/Badge';
import Avatar from '../shared/Avatar';
import IconButton from '../shared/IconButton';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onMenuClick: () => void;
  /** Path to return to. When set, a back button appears before the title. */
  backTo?: string;
  backLabel?: string;
}

export default function Header({ title, subtitle, onMenuClick, backTo, backLabel }: HeaderProps) {
  const { user } = useAuth();
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
        <IconButton
          icon={theme === 'dark' ? 'sun' : 'moon'}
          iconSize={15}
          label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={toggleTheme}
        />

        {user && (
          <div className="flex items-center gap-2.5">
            <div className="hidden sm:block">
              <RoleBadge role={user.role} />
            </div>
            <Avatar name={user.name || user.email} title={user.name} />
          </div>
        )}
      </div>
    </header>
  );
}
