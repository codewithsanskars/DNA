import { ReactNode } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

interface AppLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export default function AppLayout({ title, subtitle, children }: AppLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 text-gray-900 dark:bg-black dark:text-white">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title={title} subtitle={subtitle} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
