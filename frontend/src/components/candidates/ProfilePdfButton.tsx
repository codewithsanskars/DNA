import { useState } from 'react';
import { pdfApi } from '../../api/pdf.api';
import { useToast } from '../shared/Toast';
import Button from '../shared/Button';
import Modal from '../shared/Modal';
import { Field, Select } from '../shared/Field';
import { Candidate } from '../../types';

/**
 * "Download PDF" for a candidate. Clients download straight away (the server
 * always gives them the client-safe version). Admins choose between a
 * client-safe PDF they can forward and an internal one with CTC and notes,
 * and can add a JD match section for one of the candidate's roles.
 */
export default function ProfilePdfButton({ candidate, isAdmin }: { candidate: Candidate; isAdmin: boolean }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [variant, setVariant] = useState<'client' | 'internal'>('client');
  const [jobId, setJobId] = useState('');

  const download = async (opts: { variant?: 'client' | 'internal'; jobId?: string }) => {
    setBusy(true);
    try {
      await pdfApi.candidate(candidate._id, opts);
      setOpen(false);
    } catch {
      toast.error('Couldn’t generate the PDF', 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const links = candidate.jobLinks || [];

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        icon="download"
        loading={busy && !open}
        onClick={() => (isAdmin ? setOpen(true) : download({ jobId: links.length === 1 ? links[0].jobId : undefined }))}
      >
        PDF
      </Button>
      {open && (
        <Modal
          title="Download profile PDF"
          description={`${candidate.firstName} ${candidate.lastName}`}
          onClose={() => setOpen(false)}
          centered
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" icon="download" loading={busy} onClick={() => download({ variant, jobId: jobId || undefined })}>
                Download
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-2">
              {(
                [
                  ['client', 'Client-safe', 'No CTC, tags, owner, notes or other clients’ roles. Safe to forward.'],
                  ['internal', 'Internal', 'Everything, including compensation and recruiter notes. For SWFS only.'],
                ] as const
              ).map(([value, label, help]) => (
                <label
                  key={value}
                  className={`flex cursor-pointer gap-3 rounded-md border p-3 ${variant === value ? 'border-brand bg-brand-subtle/40' : 'border-border'}`}
                >
                  <input type="radio" name="pdf-variant" checked={variant === value} onChange={() => setVariant(value)} className="mt-1" />
                  <span>
                    <span className="block text-[13px] font-medium text-foreground">{label}</span>
                    <span className="block text-xs text-muted-foreground">{help}</span>
                  </span>
                </label>
              ))}
            </div>
            {links.length > 0 && (
              <Field label="Include JD match for" hint="optional">
                {(fid) => (
                  <Select id={fid} value={jobId} onChange={(e) => setJobId(e.target.value)}>
                    <option value="">No match section</option>
                    {links.map((l) => (
                      <option key={l.jobId} value={l.jobId}>
                        {l.jobTitle}
                        {l.organizationName ? ` · ${l.organizationName}` : ''}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
