import { ReactNode, useCallback, useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

interface AppLayoutProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Path to return to. When set, a back button appears before the title. */
  backTo?: string;
  backLabel?: string;
  children: ReactNode;
}

const STORAGE_KEY = 'swfs_sidebar_collapsed';

function readCollapsed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export default function AppLayout({ title, subtitle, actions, backTo, backLabel, children }: AppLayoutProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          title={title}
          subtitle={subtitle}
          onMenuClick={() => setMobileNavOpen(true)}
          backTo={backTo}
          backLabel={backLabel}
        />

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
            {actions && (
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">{actions}</div>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
