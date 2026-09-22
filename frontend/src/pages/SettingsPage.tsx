import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import AppLayout from '../components/layout/AppLayout';
import Card, { CardHeader, CardBody } from '../components/shared/Card';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import Icon from '../components/shared/Icon';
import Avatar from '../components/shared/Avatar';
import { Field, Input } from '../components/shared/Field';
import { errorMessage } from '../utils/errors';
import Button from '../components/shared/Button';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{children}</span>
    </div>
  );
}

function ProfilePhoto() {
  const { user, uploadAvatar, removeAvatar } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = uploading || removing;

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setError('Photo must be a JPG, PNG, or WebP image');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError('Photo must be 2MB or smaller');
      return;
    }

    setError(null);
    setUploading(true);
    try {
      await uploadAvatar(file);
    } catch (err) {
      setError(errorMessage(err, 'Failed to upload photo'));
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setError(null);
    setRemoving(true);
    try {
      await removeAvatar();
    } catch (err) {
      setError(errorMessage(err, 'Failed to remove photo'));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 pb-2 pt-4">
      <div className="relative">
        <Avatar name={user?.name || user?.email} imageUrl={user?.avatarUrl} size="xl" />

        {busy && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
            <span
              className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent opacity-90"
              aria-hidden="true"
            />
          </div>
        )}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-label="Change photo"
          title="Change photo"
          className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-brand text-white shadow-xs transition-colors hover:bg-brand-hover disabled:pointer-events-none disabled:opacity-50"
        >
          <Icon name="edit" size={14} />
        </button>

        {user?.avatarUrl && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy}
            aria-label="Remove photo"
            title="Remove photo"
            className="absolute -bottom-1 -left-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-card text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            <Icon name="trash" size={12} />
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {error && <p className="text-xs text-brand-text">{error}</p>}
    </div>
  );
}

function ProfileForm() {
  const { user, updateProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty = name.trim() !== (user?.name || '') || email.trim().toLowerCase() !== (user?.email || '');

  const startEditing = () => {
    setName(user?.name || '');
    setEmail(user?.email || '');
    setError(null);
    setSaved(false);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setName(user?.name || '');
    setEmail(user?.email || '');
    setError(null);
    setIsEditing(false);
  };

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
      setIsEditing(false);
    } catch (err) {
      setError(errorMessage(err, 'Failed to update profile'));
    } finally {
      setSaving(false);
    }
  };

  if (!isEditing) {
    return (
      <div className="py-2">
        <Row label="Name">{user?.name || ''}</Row>
        <Row label="Email">{user?.email || ''}</Row>
        <Row label="Role">{user?.role || ''}</Row>
        <Row label="Organization">{user?.organizationName || '—'}</Row>

        <div className="flex justify-end pt-2">
          <Button type="button" variant="secondary" size="sm" icon="edit" onClick={startEditing}>
            Edit
          </Button>
        </div>
      </div>
    );
  }

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
        <Button type="button" variant="secondary" onClick={cancelEditing} disabled={saving}>
          Cancel
        </Button>
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
            <ProfilePhoto />
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
