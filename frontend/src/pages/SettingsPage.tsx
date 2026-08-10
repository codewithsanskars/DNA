import AppLayout from '../components/layout/AppLayout';
import Card from '../components/shared/Card';
import { RoleBadge } from '../components/shared/Badge';
import { useAuth } from '../hooks/useAuth';

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <AppLayout title="Settings" subtitle="Account and portal preferences">
      <div className="max-w-lg space-y-4">
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">Your Account</h3>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-500">Name</p>
              <p className="text-sm text-gray-900 dark:text-white">{user?.name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Email</p>
              <p className="text-sm text-gray-900 dark:text-white">{user?.email}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Role</p>
              <div className="mt-1">
                <RoleBadge role={user?.role || ''} />
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500">Organization</p>
              <p className="text-sm text-gray-900 dark:text-white">{user?.organizationName}</p>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Authentication</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Authentication is managed via Okta SSO. Contact your SWFS administrator to update
            permissions or organization access.
          </p>
        </Card>

        <Card>
          <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Integrations</h3>
          <div className="space-y-3">
            {[
              { name: 'Recruit CRM', status: 'Connected (Stub)', desc: 'Source of truth for jobs and candidates' },
              { name: 'Attio CRM', status: 'Connected (Stub)', desc: 'Organization and contact intelligence' },
              { name: 'Okta', status: 'Connected (Stub)', desc: 'SSO authentication provider' },
            ].map((integration) => (
              <div key={integration.name} className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-900 dark:text-white">{integration.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-500">{integration.desc}</p>
                </div>
                <span className="rounded bg-green-100 px-2 py-0.5 text-[10px] text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  {integration.status}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
