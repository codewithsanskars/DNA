import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import { TableShell, Th, Tr, Td, EmptyRow } from '../components/shared/Table';
import { organizationApi } from '../api/organization.api';

const SOCIAL_ICONS: Record<string, string> = {
  linkedin: 'in',
  twitter: '𝕏',
  facebook: 'f',
};

export default function OrganizationPage() {
  const navigate = useNavigate();
  const { data: orgs, isLoading } = useQuery({
    queryKey: ['organizations'],
    queryFn: organizationApi.getOrganizations,
  });

  return (
    <AppLayout title="Organizations" subtitle="Client organizations and their contact details">
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Industry</Th>
              <Th>Email</Th>
              <Th>Headquarters</Th>
              <Th>Social</Th>
            </tr>
          </thead>
          <tbody>
            {(orgs || []).map((org) => (
              <Tr key={org._id} onClick={() => navigate(`/organization/${org._id}`)}>
                <Td className="font-medium text-gray-900 dark:text-white">{org.name}</Td>
                <Td className="text-gray-500 dark:text-gray-400">{org.industry || '—'}</Td>
                <Td className="text-gray-500 dark:text-gray-400">{org.attio?.email || '—'}</Td>
                <Td className="text-gray-500 dark:text-gray-400">{org.attio?.hq || '—'}</Td>
                <Td>
                  <div className="flex gap-2">
                    {org.attio?.socialLinks &&
                      Object.entries(org.attio.socialLinks).map(([platform, url]) =>
                        url ? (
                          <a
                            key={platform}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title={platform}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600 hover:bg-gray-200 dark:bg-[#1a1a1a] dark:text-gray-300 dark:hover:bg-[#222]"
                          >
                            {SOCIAL_ICONS[platform] || platform.charAt(0).toUpperCase()}
                          </a>
                        ) : null
                      )}
                  </div>
                </Td>
              </Tr>
            ))}
            {(!orgs || orgs.length === 0) && <EmptyRow colSpan={5}>No organizations found.</EmptyRow>}
          </tbody>
        </TableShell>
      )}
    </AppLayout>
  );
}
