import { ReactNode } from 'react';

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-[#222] dark:bg-[#111]">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-3 text-left text-xs font-medium text-gray-400 dark:text-gray-500 ${className}`}>
      {children}
    </th>
  );
}

export function Tr({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <tr
      onClick={onClick}
      className={`border-b border-gray-100 last:border-0 dark:border-[#1a1a1a] ${
        onClick ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-[#0f0f0f]' : ''
      }`}
    >
      {children}
    </tr>
  );
}

export function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-12 text-center text-sm text-gray-500 dark:text-gray-400">
        {children}
      </td>
    </tr>
  );
}
