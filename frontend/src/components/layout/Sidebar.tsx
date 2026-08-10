import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import swfsLogo from '../../assets/SWFS-LOGO.png';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: '▦' },
  { to: '/jobs', label: 'Open Roles', icon: '◈' },
  { to: '/candidates', label: 'Candidates', icon: '◉' },
  { to: '/organization', label: 'Organization', icon: '⬡' },
  { to: '/activity', label: 'Activity Log', icon: '◎' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-gray-200 bg-white dark:border-[#222] dark:bg-[#0a0a0a]">
      {/* Logo */}
      <Link
        to="/dashboard"
        className="flex items-center gap-2 border-b border-gray-200 px-5 py-4 dark:border-[#222]"
      >
        <img src={swfsLogo} alt="SWFS" className="h-7 w-auto" />
      </Link>

      {/* Org name (hidden for SWFS admins, who aren't scoped to a single org) */}
      {user?.role !== 'SWFS_ADMIN' && (
        <div className="border-b border-gray-200 px-5 py-3 dark:border-[#222]">
          <p className="text-[10px] font-medium uppercase tracking-widest text-gray-400 dark:text-gray-500">Organization</p>
          <p className="mt-0.5 truncate text-sm font-medium text-gray-900 dark:text-white">{user?.organizationName}</p>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-2 py-3">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-brand-600/10 text-brand-600 dark:text-brand-400'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-[#1a1a1a] dark:hover:text-white'
              }`
            }
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-gray-200 px-4 py-3 dark:border-[#222]">
        <p className="truncate text-xs text-gray-900 dark:text-white">{user?.name}</p>
        <p className="truncate text-[10px] text-gray-500">{user?.email}</p>
        <button
          onClick={logout}
          className="mt-2 w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-900 transition-colors dark:border-[#333] dark:text-gray-400 dark:hover:border-[#444] dark:hover:text-white"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
