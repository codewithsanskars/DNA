import { useQuery } from '@tanstack/react-query';
import AppLayout from '../components/layout/AppLayout';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import { activityApi } from '../api/organization.api';

const ACTION_ICONS: Record<string, string> = {
  SHORTLIST: '⭐',
  REJECT: '✕',
  REQUEST_INTERVIEW: '📅',
  SUBMIT_FEEDBACK: '💬',
};

function formatAction(action: string) {
  return action.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export default function ActivityPage() {
  const { data: logs, isLoading } = useQuery({
    queryKey: ['activity'],
    queryFn: () => activityApi.getActivity(100),
  });

  return (
    <AppLayout title="Activity Log" subtitle="Audit trail of all portal actions">
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white dark:border-[#222] dark:bg-[#111]">
          {!logs || logs.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">No activity recorded yet.</p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-600">
                Actions like shortlisting or rejecting candidates will appear here.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-[#222]">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 dark:text-gray-500">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 dark:text-gray-500">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 dark:text-gray-500">Entity</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 dark:text-gray-500">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-[#1a1a1a]">
                {logs.map((log) => (
                  <tr key={log._id} className="hover:bg-gray-50 dark:hover:bg-[#0f0f0f]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span>{ACTION_ICONS[log.action] || '●'}</span>
                        <span className="text-gray-900 dark:text-white">{formatAction(log.action)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{log.userEmail}</td>
                    <td className="px-4 py-3 text-gray-400 dark:text-gray-500 font-mono text-xs">{log.entityType} / {log.entityId.slice(-8)}</td>
                    <td className="px-4 py-3 text-gray-400 dark:text-gray-500 text-xs">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </AppLayout>
  );
}
