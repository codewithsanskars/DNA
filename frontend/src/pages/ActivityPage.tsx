import { useQuery } from '@tanstack/react-query';
import AppLayout from '../components/layout/AppLayout';
import { TableShell, Thead, Th, Tr, Td, EmptyRow } from '../components/shared/Table';
import { TableSkeleton } from '../components/shared/States';
import Icon, { IconName } from '../components/shared/Icon';
import { activityApi } from '../api/activity.api';
import { queryKeys } from '../api/queryKeys';
import { humanize, formatTimestamp } from '../utils/format';

const ACTION_ICONS: Record<string, IconName> = {
  SHORTLIST: 'star',
  REJECT: 'close',
  REQUEST_INTERVIEW: 'calendar',
  SUBMIT_FEEDBACK: 'message',
};

export default function ActivityPage() {
  const { data: logs, isLoading } = useQuery({
    queryKey: queryKeys.activity,
    queryFn: () => activityApi.getActivity(100),
  });

  return (
    <AppLayout title="Activity Log" subtitle="Audit trail of portal actions">
      {isLoading ? (
        <TableSkeleton cols={4} rows={8} />
      ) : (
        <TableShell>
          <Thead>
            <tr>
              <Th>Action</Th>
              <Th>User</Th>
              <Th>Entity</Th>
              <Th className="text-right">Time</Th>
            </tr>
          </Thead>
          <tbody>
            {(logs || []).map((log) => (
              <Tr key={log._id}>
                <Td>
                  <span className="inline-flex items-center gap-2.5 text-foreground">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-muted-foreground ring-1 ring-inset ring-border">
                      <Icon name={ACTION_ICONS[log.action] || 'activity'} size={13} />
                    </span>
                    {humanize(log.action)}
                  </span>
                </Td>
                <Td>{log.userEmail}</Td>
                <Td className="font-mono text-2xs text-subtle-foreground">
                  {log.entityType} / {log.entityId.slice(-8)}
                </Td>
                <Td className="text-right tabular-nums text-2xs text-subtle-foreground">
                  {formatTimestamp(log.createdAt)}
                </Td>
              </Tr>
            ))}
            {(!logs || logs.length === 0) && (
              <EmptyRow colSpan={4}>
                No activity recorded yet. Actions like shortlisting or rejecting candidates will appear here.
              </EmptyRow>
            )}
          </tbody>
        </TableShell>
      )}
    </AppLayout>
  );
}
