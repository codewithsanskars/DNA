import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { organizationApi } from '../api/organization.api';
import { queryKeys } from '../api/queryKeys';

interface UseOrganizationsOptions {
  /** Skip the request until the caller needs it (e.g. admin-only screens). */
  enabled?: boolean;
}

/**
 * The client organization list, plus a `clientName` lookup that resolves an org
 * id to its display name (falling back to the id when it isn't loaded / found).
 */
export function useOrganizations({ enabled = true }: UseOrganizationsOptions = {}) {
  const query = useQuery({
    queryKey: queryKeys.organizations,
    queryFn: organizationApi.getOrganizations,
    enabled,
  });

  const organizations = query.data;
  const clientName = useCallback(
    (organizationId: string) =>
      organizations?.find((org) => org._id === organizationId)?.name ?? organizationId,
    [organizations]
  );

  return { ...query, organizations, clientName };
}
