import AppLayout from '../components/layout/AppLayout';
import Card, { CardHeader, CardBody } from '../components/shared/Card';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import Icon from '../components/shared/Icon';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{children}</span>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <AppLayout title="Settings">
      <div className="max-w-2xl space-y-6">
        <Card padded={false}>
          <CardHeader title="Your account" />
          <CardBody className="divide-y divide-border py-1">
            <Row label="Name">{user?.name || '—'}</Row>
            <Row label="Email">{user?.email || '—'}</Row>
            <Row label="Role">{user?.role || ''}</Row>
            <Row label="Organization">{user?.organizationName || '—'}</Row>
          </CardBody>
        </Card>

        <Card padded={false}>
          <CardHeader title="Appearance" />
          <CardBody>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground">Theme</p>
              </div>
              <button
                onClick={toggleTheme}
                className="inline-flex items-center gap-2 rounded-md border border-border-strong bg-card px-3 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={14} />
                Switch to {theme === 'dark' ? 'light' : 'dark'}
              </button>
            </div>
          </CardBody>
        </Card>

        <Card padded={false}>
          <CardHeader title="Authentication" />
          <CardBody>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Authentication is managed via Okta SSO. Contact your SWFS administrator to update
              permissions or organization access.
            </p>
          </CardBody>
        </Card>
      </div>
    </AppLayout>
  );
}
