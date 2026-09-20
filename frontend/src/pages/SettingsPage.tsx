import { FormEvent, useState } from 'react';
import AppLayout from '../components/layout/AppLayout';
import Card, { CardHeader, CardBody } from '../components/shared/Card';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import Icon from '../components/shared/Icon';
import { Field, Input } from '../components/shared/Field';
import { errorMessage } from '../utils/errors';
import Button from '../components/shared/Button';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{children}</span>
    </div>
  );
}

function ProfileForm() {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty = name.trim() !== (user?.name || '') || email.trim().toLowerCase() !== (user?.email || '');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);

    const trimmedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    if (!trimmedName) {
      setError('Name is required');
      return;
    }
    if (!EMAIL_RE.test(normalizedEmail)) {
      setError('Enter a valid email address');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await updateProfile({ name: trimmedName, email: normalizedEmail });
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err, 'Failed to update profile'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-2">
      <Field label="Name" required>
        {(id) => (
          <Input
            id={id}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
            placeholder="Your name"
          />
        )}
      </Field>

      <Field label="Email" required error={error} help={saved && !error ? 'Profile updated' : undefined}>
        {(id) => (
          <Input
            id={id}
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setSaved(false);
            }}
            placeholder="you@example.com"
          />
        )}
      </Field>

      <Row label="Role">{user?.role || ''}</Row>
      <Row label="Organization">{user?.organizationName || '—'}</Row>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" variant="primary" disabled={!dirty} loading={saving}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();

  return (
    <AppLayout title="Settings">
      <div className="max-w-2xl space-y-6">
        <Card padded={false}>
          <CardHeader title="Your account" />
          <CardBody className="py-1">
            <ProfileForm />
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
