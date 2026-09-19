import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { isAdminRole } from '../../utils/roles';
import Icon, { IconName } from '../shared/Icon';
import IconButton from '../shared/IconButton';
import Avatar from '../shared/Avatar';
import swfsLogo from '../../assets/SWFS-LOGO.png';

const NAV: { to: string; label: string; icon: IconName; adminOnly?: boolean }[] = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/jobs', label: 'Open Roles', icon: 'briefcase' },
  { to: '/candidates', label: 'Candidates', icon: 'users' },
  // A consolidated pool of reachable candidates (Open + re-engageable
  // Archived) — SWFS-staff workflow, no reason for a client org to see it.
  { to: '/master-database', label: 'Master Database', icon: 'inbox', adminOnly: true },
  // LinkedIn sourcing is an SWFS-staff workflow; a client org has no reason
  // to see it, so this tab doesn't exist for them at all.
  { to: '/search', label: 'Search', icon: 'search', adminOnly: true },
  // SWFS staff manage the client roster; a client org has no reason to
  // browse other organizations, so this tab doesn't exist for them at all.
  { to: '/organization', label: 'Organizations', icon: 'building', adminOnly: true },
  { to: '/activity', label: 'Activity Log', icon: 'activity' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

interface SidebarContentProps {
  /** Desktop icon-only rail. */
  rail?: boolean;
  onNavigate?: () => void;
  onToggleCollapse?: () => void;
}

function SidebarContent({ rail = false, onNavigate, onToggleCollapse }: SidebarContentProps) {
  const { user, logout } = useAuth();
  const admin = isAdminRole(user?.role);
  const avatarName = user?.name || user?.email;

  return (
    <div
      className={`flex h-full flex-col bg-card transition-[width] duration-200 ease-out ${
        rail ? 'w-16' : 'w-60'
      }`}
    >
      {/* Header row */}
      <div
        className={`flex h-14 shrink-0 items-center border-b border-border ${
          rail ? 'justify-center px-2' : 'justify-between pl-5 pr-2'
        }`}
      >
        {!rail && (
          <Link to="/dashboard" onClick={onNavigate} className="flex items-center">
            <img src={swfsLogo} alt="SWFS" className="h-6 w-auto" />
          </Link>
        )}
        {onToggleCollapse && (
          <IconButton
            icon="menu"
            iconSize={17}
            label={rail ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={onToggleCollapse}
          />
        )}
      </div>

      {/* Workspace / org */}
      {!rail && (
        <div className="border-b border-border px-5 py-3">
          <p className="text-2xs font-medium uppercase tracking-wider text-subtle-foreground">
            {admin ? 'Workspace' : 'Organization'}
          </p>
          <p className="mt-0.5 truncate text-[13px] font-medium text-foreground">
            {admin ? 'All Clients' : user?.organizationName || '—'}
          </p>
        </div>
      )}

      {/* Nav */}
      <nav className={`flex-1 space-y-0.5 overflow-y-auto ${rail ? 'px-2 py-3' : 'p-3'}`}>
        {NAV.filter((item) => !item.adminOnly || admin).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            title={rail ? item.label : undefined}
            className={({ isActive }) =>
              `group relative flex items-center rounded-md text-[13px] font-medium transition-colors ${
                rail ? 'mx-auto h-10 w-10 justify-center' : 'gap-3 px-3 py-2'
              } ${
                isActive
                  ? 'bg-brand-subtle text-brand-text'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && !rail && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-brand" />
                )}
                <Icon name={item.icon} size={rail ? 18 : 17} className={isActive ? '' : 'opacity-80'} />
                {!rail && item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className={`border-t border-border ${rail ? 'flex flex-col items-center gap-1 p-2' : 'p-3'}`}>
        {rail ? (
          <>
            <Avatar name={avatarName} title={user?.name} />
            <IconButton icon="logout" iconSize={16} label="Sign out" variant="ghost" onClick={logout} />
          </>
        ) : (
          <>
            <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
              <Avatar name={avatarName} title={user?.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-foreground">{user?.name}</p>
                <p className="truncate text-2xs text-subtle-foreground">{user?.email}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Icon name="logout" size={16} />
              Sign out
            </button>
          </>
        )}
      </div>
    </div>
  );
}

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function Sidebar({ open, onClose, collapsed, onToggleCollapse }: SidebarProps) {
  return (
    <>
      {/* Desktop — expands / collapses to an icon rail */}
      <aside
        className={`hidden shrink-0 overflow-hidden border-r border-border transition-[width] duration-200 ease-out lg:block ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        <SidebarContent rail={collapsed} onToggleCollapse={onToggleCollapse} />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={onClose} />
          <aside className="absolute inset-y-0 left-0 border-r border-border shadow-lg animate-scale-in">
            <SidebarContent onNavigate={onClose} />
          </aside>
        </div>
      )}
    </>
  );
}
