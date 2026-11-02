import { useQuery } from '@tanstack/react-query';
import { workflowApi } from '../api/workflow.api';
import { queryKeys } from '../api/queryKeys';
import { useAuth } from '../context/AuthContext';
import { isAdminRole } from '../utils/roles';

/** SWFS team members (owners / assignees / @mentions). Admin sessions only. */
export function useStaff() {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.staff,
    queryFn: workflowApi.getStaff,
    enabled: isAdminRole(user?.role),
    staleTime: 5 * 60_000,
  });
}

/** Overdue / due-today counts + recent @mentions for the signed-in recruiter. */
export function useTaskSummary() {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.taskSummary,
    queryFn: workflowApi.getTaskSummary,
    enabled: isAdminRole(user?.role),
    refetchInterval: 60_000,
  });
}
