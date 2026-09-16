import { FormEvent, useState } from 'react';
import Modal from '../shared/Modal';
import Button from '../shared/Button';
import { Input, Label } from '../shared/Field';

interface OktaRegisterModalProps {
  email: string;
  name: string;
  onSubmit: (organizationName: string) => Promise<void>;
  onCancel: () => void;
}

/** Shown right after a first-time Okta sign-in: no local account exists yet, so we
 *  collect the organization before provisioning one (always as a CLIENT). */
export default function OktaRegisterModal({ email, name, onSubmit, onCancel }: OktaRegisterModalProps) {
  const [organizationName, setOrganizationName] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!organizationName.trim()) return;
    setError('');
    setIsSubmitting(true);
    try {
      await onSubmit(organizationName.trim());
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      title="Welcome to SWFS"
      description={`Signed in as ${name} (${email})`}
      onClose={onCancel}
      centered
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={isSubmitting}>
            Continue
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-[13px] text-muted-foreground">
          We don't have an account for you yet. Tell us your organization to finish setting one up.
        </p>
        <div>
          <Label htmlFor="org-name">Organization name</Label>
          <Input
            id="org-name"
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            placeholder="Acme Inc."
            autoFocus
            required
          />
        </div>
        {error && <p className="text-xs text-brand-text">{error}</p>}
      </form>
    </Modal>
  );
}
