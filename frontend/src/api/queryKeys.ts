/**
 * Canonical react-query keys. Import these instead of writing key arrays inline
 * so queries and their invalidations can never drift apart.
 */
export const queryKeys = {
  jobs: ['jobs'] as const,
  jobPipeline: (jobId: string) => ['pipeline', jobId] as const,
  candidates: ['candidates'] as const,
  candidate: (id: string) => ['candidate', id] as const,
  organizations: ['organizations'] as const,
  organization: (id: string) => ['organization', id] as const,
  dashboard: ['dashboard'] as const,
  activity: ['activity'] as const,
};
