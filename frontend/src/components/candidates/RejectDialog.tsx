import { useState } from 'react';
import Modal from '../shared/Modal';
import Button from '../shared/Button';
import { Field, Select, Textarea } from '../shared/Field';
import { RejectionReason } from '../../types';
import { REJECTION_LABELS } from '../../utils/labels';

const REASONS = Object.keys(REJECTION_LABELS) as RejectionReason[];

/**
 * Asks why a candidate is being rejected (RC-46) — the reason feeds
 * rejection reporting, and lets the candidate be re-engaged sensibly later.
 */
export default function RejectDialog({
  candidateName,
  jobTitle,
  loading,
  onCancel,
  onConfirm,
}: {
  candidateName: string;
  jobTitle: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (rejection: { rejectionReason: RejectionReason; rejectionNote?: string }) => void;
}) {
  const [reason, setReason] = useState<RejectionReason | ''>('');
  const [note, setNote] = useState('');

  return (
    <Modal
      title="Reject candidate"
      description={`${candidateName} will be moved to Rejected for ${jobTitle}.`}
      onClose={onCancel}
      size="sm"
      centered
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!reason}
            loading={loading}
            onClick={() => reason && onConfirm({ rejectionReason: reason, rejectionNote: note.trim() || undefined })}
          >
            Reject
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Reason" required>
          {(id) => (
            <Select id={id} value={reason} onChange={(e) => setReason(e.target.value as RejectionReason)} autoFocus>
              <option value="">Select a reason…</option>
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {REJECTION_LABELS[r]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Note" hint="optional">
          {(id) => <Textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Anything the team should know" />}
        </Field>
      </div>
    </Modal>
  );
}
