import { useQuery } from '@tanstack/react-query';
import { aiApi } from '../api/ai.api';
import { queryKeys } from '../api/queryKeys';

/** Which provider is live (OpenAI if the server has a key, else Ollama) and whether it's reachable. */
export function useAiStatus() {
  return useQuery({
    queryKey: queryKeys.aiStatus,
    queryFn: aiApi.status,
    staleTime: 60_000,
    retry: false,
  });
}
