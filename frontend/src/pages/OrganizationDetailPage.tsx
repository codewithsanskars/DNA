import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AppLayout from '../components/layout/AppLayout';
import Card from '../components/shared/Card';
import Avatar from '../components/shared/Avatar';
import DetailRow from '../components/shared/DetailRow';
import SocialLinks from '../components/shared/SocialLinks';
import { CenteredSpinner } from '../components/shared/LoadingSpinner';
import { ErrorState } from '../components/shared/States';
import Icon from '../components/shared/Icon';
import { organizationApi } from '../api/organization.api';
import { queryKeys } from '../api/queryKeys';

export default function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: org, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.organization(id!),
    queryFn: () => organizationApi.getOrganization(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <AppLayout title="Organization" backTo="/organization" backLabel="Back to organizations">
        <CenteredSpinner />
      </AppLayout>
    );
  }

  if (error || !org) {
    return (
      <AppLayout title="Organization" backTo="/organization" backLabel="Back to organizations">
        <ErrorState title="Organization not found" onRetry={() => refetch()} />
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title={org.name}
      subtitle="Client account details"
      backTo="/organization"
      backLabel="Back to organizations"
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card padded={false}>
            <div className="flex items-start gap-3 border-b border-border px-5 py-4">
              <Avatar name={org.name} imageUrl={org.logoUrl} size="lg" />
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-foreground">{org.name}</h2>
                {org.description && (
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{org.description}</p>
                )}
              </div>
            </div>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 px-5 py-4 sm:grid-cols-2">
              {org.industry && <DetailRow label="Industry">{org.industry}</DetailRow>}
              {org.employeeCount != null && (
                <DetailRow label="Employees">{org.employeeCount.toLocaleString()}</DetailRow>
              )}
              {org.hq && <DetailRow label="Headquarters">{org.hq}</DetailRow>}
              {org.founded && <DetailRow label="Founded">{org.founded}</DetailRow>}
              {org.website && (
                <DetailRow label="Website">
                  <a
                    href={org.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-brand-text hover:underline"
                  >
                    {org.website.replace(/^https?:\/\//, '')}
                    <Icon name="external" size={12} />
                  </a>
                </DetailRow>
              )}
              {org.email && (
                <DetailRow label="Email">
                  <a href={`mailto:${org.email}`} className="text-brand-text hover:underline">
                    {org.email}
                  </a>
                </DetailRow>
              )}
            </dl>

            <SocialLinks links={org.socialLinks} className="border-t border-border px-5 py-3" />
          </Card>

          {org.contacts && org.contacts.length > 0 && (
            <div>
              <h3 className="mb-3 text-[13px] font-semibold text-foreground">Key contacts</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {org.contacts.map((contact, i) => (
                  <Card key={i} className="flex items-center gap-3">
                    <Avatar name={contact.name} size="md" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{contact.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{contact.title}</p>
                      <a
                        href={`mailto:${contact.email}`}
                        className="truncate text-xs text-brand-text hover:underline"
                      >
                        {contact.email}
                      </a>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
