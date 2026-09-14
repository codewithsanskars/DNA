import { useQuery } from '@tanstack/react-query';
import { jobApi } from '../api/job.api';
import { queryKeys } from '../api/queryKeys';

/** All jobs visible to the current user. */
export function useJobs() {
  return useQuery({ queryKey: queryKeys.jobs, queryFn: jobApi.getJobs });
}
