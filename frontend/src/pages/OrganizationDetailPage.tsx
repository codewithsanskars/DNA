import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AppLayout from '../components/layout/AppLayout';
import Card from '../components/shared/Card';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import { organizationApi } from '../api/organization.api';

const SOCIAL_ICONS: Record<string, string> = {
  linkedin: 'in',
  twitter: '𝕏',
  facebook: 'f',
};

export default function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: org, isLoading } = useQuery({
    queryKey: ['organization', id],
    queryFn: () => organizationApi.getOrganization(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <AppLayout title="Organization">
        <div className="flex h-64 items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      </AppLayout>
    );
  }

  if (!org) {
    return (
      <AppLayout title="Organization">
        <p className="text-red-400">Organization not found.</p>
      </AppLayout>
    );
  }

  const attio = org.attio;

  return (
    <AppLayout title={org.name} subtitle="Account information from Attio CRM">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">{org.name}</h2>
            {attio?.description && (
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{attio.description}</p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              {org.industry && (
                <div>
                  <p className="text-xs text-gray-500">Industry</p>
                  <p className="text-gray-900 dark:text-white">{org.industry}</p>
                </div>
              )}
              {attio?.employeeCount && (
                <div>
                  <p className="text-xs text-gray-500">Employees</p>
                  <p className="text-gray-900 dark:text-white">{attio.employeeCount.toLocaleString()}</p>
                </div>
              )}
              {attio?.hq && (
                <div>
                  <p className="text-xs text-gray-500">Headquarters</p>
                  <p className="text-gray-900 dark:text-white">{attio.hq}</p>
                </div>
              )}
              {attio?.founded && (
                <div>
                  <p className="text-xs text-gray-500">Founded</p>
                  <p className="text-gray-900 dark:text-white">{attio.founded}</p>
                </div>
              )}
              {org.website && (
                <div>
                  <p className="text-xs text-gray-500">Website</p>
                  <a href={org.website} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300">
                    {org.website}
                  </a>
                </div>
              )}
              {attio?.email && (
                <div>
                  <p className="text-xs text-gray-500">Email</p>
                  <a href={`mailto:${attio.email}`} className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300">
                    {attio.email}
                  </a>
                </div>
              )}
            </div>

            {/* Social links */}
            {attio?.socialLinks && (
              <div className="mt-4 flex gap-2">
                {Object.entries(attio.socialLinks).map(([platform, url]) =>
                  url ? (
                    <a
                      key={platform}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={platform}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600 hover:bg-gray-200 dark:bg-[#1a1a1a] dark:text-gray-300 dark:hover:bg-[#222]"
                    >
                      {SOCIAL_ICONS[platform] || platform.charAt(0).toUpperCase()}
                    </a>
                  ) : null
                )}
              </div>
            )}
          </Card>

          {/* Contacts */}
          {attio?.contacts && attio.contacts.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Key Contacts</h3>
              <div className="space-y-2">
                {attio.contacts.map((contact, i) => (
                  <Card key={i}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-900 dark:bg-[#1a1a1a] dark:text-white">
                        {contact.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{contact.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{contact.title}</p>
                        <p className="text-xs text-gray-500">{contact.email}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Recent CRM activity */}
        {attio?.recentActivity && attio.recentActivity.length > 0 && (
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">CRM Activity</h3>
            <div className="space-y-2">
              {attio.recentActivity.map((a, i) => (
                <Card key={i}>
                  <div className="flex gap-2">
                    <span className="text-sm">{a.type === 'meeting' ? '📅' : '📝'}</span>
                    <div>
                      <p className="text-xs text-gray-900 dark:text-white">{a.content}</p>
                      <p className="mt-0.5 text-[10px] text-gray-500">
                        {new Date(a.date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
