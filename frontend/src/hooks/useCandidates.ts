import { useQuery } from '@tanstack/react-query';
import { candidateApi } from '../api/candidate.api';
import { queryKeys } from '../api/queryKeys';

/** All candidates visible to the current user. */
export function useCandidates() {
  return useQuery({ queryKey: queryKeys.candidates, queryFn: candidateApi.getCandidates });
}
