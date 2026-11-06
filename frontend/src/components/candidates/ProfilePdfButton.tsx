import { useState } from 'react';
import { EXPORT_FORMATS, ExportFormat, pdfApi } from '../../api/pdf.api';
import { useToast } from '../shared/Toast';
import Button from '../shared/Button';
import Modal from '../shared/Modal';
import { Field, Select } from '../shared/Field';
import { Candidate } from '../../types';

/**
 * "Download" for a candidate profile, as PDF or Word. Both formats come out on
 * the SWFS letterhead template. Admins also choose between a client-safe copy
 * they can forward and an internal one with CTC and notes. Clients always get
 * the client-safe version (the server enforces it). Either can add a JD match
 * section for one of the candidate's roles.
 */
export default function ProfilePdfButton({ candidate, isAdmin }: { candidate: Candidate; isAdmin: boolean }) {
  const toast = useToast();
  const links = candidate.jobLinks || [];
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [variant, setVariant] = useState<'client' | 'internal'>('client');
  // Clients with a single role get its match section by default (previous behaviour).
  const [jobId, setJobId] = useState(!isAdmin && links.length === 1 ? links[0].jobId : '');

  const download = async () => {
    setBusy(true);
    try {
      await pdfApi.candidate(candidate._id, { variant: isAdmin ? variant : undefined, jobId: jobId || undefined, format });
      setOpen(false);
    } catch {
      toast.error('Couldn’t generate the document', 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="secondary" size="sm" icon="download" onClick={() => setOpen(true)}>
        Download
      </Button>
      {open && (
        <Modal
          title="Download profile"
          description={`${candidate.firstName} ${candidate.lastName}`}
          onClose={() => setOpen(false)}
          centered
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" icon="download" loading={busy} onClick={download}>
                Download {format === 'docx' ? 'Word' : 'PDF'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <span className="mb-1.5 block text-[13px] font-medium text-foreground">Format</span>
              <div className="grid grid-cols-2 gap-2">
                {EXPORT_FORMATS.map((f) => (
                  <label
                    key={f.value}
                    className={`flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-[13px] ${format === f.value ? 'border-brand bg-brand-subtle/40 font-medium text-foreground' : 'border-border text-muted-foreground'}`}
                  >
                    <input type="radio" name="doc-format" checked={format === f.value} onChange={() => setFormat(f.value)} />
                    {f.label}
                    <span className="text-xs text-muted-foreground">.{f.value}</span>
                  </label>
                ))}
              </div>
            </div>
            {isAdmin && (
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
            )}
            {links.length > 0 && (
              <Field label="Include JD match for" hint="optional">
                {(fid) => (
                  <Select id={fid} value={jobId} onChange={(e) => setJobId(e.target.value)}>
                    <option value="">No match section</option>
                    {links.map((l) => (
                      <option key={l.jobId} value={l.jobId}>
                        {l.jobTitle}
                        {isAdmin && l.organizationName ? ` · ${l.organizationName}` : ''}
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
