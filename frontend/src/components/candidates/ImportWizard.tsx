import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { candidateApi, ImportPreviewRow, ImportResult, ImportRow } from '../../api/candidate.api';
import { queryKeys } from '../../api/queryKeys';
import { Job } from '../../types';
import { parseCsv } from '../../utils/csv';
import { errorMessage } from '../../utils/errors';
import Modal from '../shared/Modal';
import Button from '../shared/Button';
import Icon from '../shared/Icon';
import Badge from '../shared/Badge';
import { Select } from '../shared/Field';
import { useToast } from '../shared/Toast';

/** Target fields a column can map to, with header synonyms for auto-mapping. */
const FIELDS: { key: string; label: string; synonyms: string[]; list?: boolean; number?: boolean }[] = [
  { key: 'name', label: 'Full name', synonyms: ['name', 'full name', 'candidate name', 'candidate'] },
  { key: 'firstName', label: 'First name', synonyms: ['first name', 'firstname', 'given name', 'first'] },
  { key: 'lastName', label: 'Last name', synonyms: ['last name', 'lastname', 'surname', 'family name', 'last'] },
  { key: 'email', label: 'Email', synonyms: ['email', 'email address', 'e-mail', 'primary email'] },
  { key: 'phone', label: 'Phone', synonyms: ['phone', 'phone number', 'mobile', 'contact number', 'cell'] },
  { key: 'currentTitle', label: 'Current title', synonyms: ['title', 'current title', 'designation', 'position', 'job title', 'current designation'] },
  { key: 'currentCompany', label: 'Current company', synonyms: ['company', 'current company', 'current organization', 'employer', 'current employer'] },
  { key: 'location', label: 'Location', synonyms: ['location', 'city', 'address', 'current location'] },
  { key: 'skills', label: 'Skills', synonyms: ['skills', 'skill', 'key skills', 'technologies', 'skillset'], list: true },
  { key: 'yearsExperience', label: 'Years of experience', synonyms: ['experience', 'years of experience', 'total experience', 'exp', 'yoe'], number: true },
  { key: 'currentCtc', label: 'Current CTC', synonyms: ['current ctc', 'current salary', 'ctc', 'salary'], number: true },
  { key: 'expectedCtc', label: 'Expected CTC', synonyms: ['expected ctc', 'expected salary', 'salary expectation'], number: true },
  { key: 'noticePeriod', label: 'Notice period (days)', synonyms: ['notice period', 'notice'], number: true },
  { key: 'availableFrom', label: 'Available from', synonyms: ['available from', 'availability', 'available date'] },
  { key: 'languages', label: 'Languages', synonyms: ['languages', 'language'], list: true },
  { key: 'tags', label: 'Tags', synonyms: ['tags', 'tag', 'labels', 'hotlist'], list: true },
  { key: 'linkedinUrl', label: 'LinkedIn URL', synonyms: ['linkedin', 'linkedin url', 'linkedin profile'] },
  { key: 'website', label: 'Website', synonyms: ['website', 'portfolio', 'url'] },
  { key: 'notes', label: 'Notes', synonyms: ['notes', 'comments', 'summary', 'remarks'] },
];
const CHUNK = 500;

const norm = (h: string) => h.toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();

function guessMapping(headers: string[]): Record<number, string> {
  const used = new Set<string>();
  const out: Record<number, string> = {};
  headers.forEach((h, i) => {
    const n = norm(h);
    const field = FIELDS.find((f) => !used.has(f.key) && f.synonyms.includes(n));
    if (field) {
      out[i] = field.key;
      used.add(field.key);
    }
  });
  return out;
}

/** Numbers like "6.5 yrs", "$120,000", "30 days" -> 6.5 / 120000 / 30. */
const toNumber = (v: string) => {
  const m = v.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : undefined;
};
const toList = (v: string) =>
  v
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
const toDate = (v: string) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
};

function buildRows(rows: string[][], mapping: Record<number, string>): ImportRow[] {
  return rows.map((r) => {
    const out: ImportRow = {};
    Object.entries(mapping).forEach(([idx, key]) => {
      const raw = (r[Number(idx)] ?? '').trim();
      if (!raw || !key) return;
      const field = FIELDS.find((f) => f.key === key)!;
      if (field.list) out[key] = toList(raw);
      else if (field.number) {
        const n = toNumber(raw);
        if (n !== undefined) out[key] = key === 'noticePeriod' ? Math.round(n) : n;
      } else if (key === 'availableFrom') {
        const d = toDate(raw);
        if (d) out[key] = d;
      } else out[key] = raw;
    });
    return out;
  });
}

type Step = 'upload' | 'map' | 'review' | 'done';

/**
 * CSV import (RC-76 / RC-78): upload → map columns (auto-guessed from the
 * header, incl. common Recruit CRM / Bullhorn / LinkedIn export headers) →
 * duplicate preview → import with skip / merge / create handling.
 */
export default function ImportWizard({ jobs, onClose }: { jobs: Job[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [preview, setPreview] = useState<ImportPreviewRow[]>([]);
  const [strategy, setStrategy] = useState<'skip' | 'update' | 'create'>('skip');
  const [jobId, setJobId] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);

  const rows = useMemo(() => buildRows(data, mapping), [data, mapping]);
  const mappedKeys = Object.values(mapping).filter(Boolean);
  const hasName = mappedKeys.includes('name') || (mappedKeys.includes('firstName') && mappedKeys.includes('lastName'));

  const onFile = async (file?: File) => {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      toast.error('Upload a .csv file', 'In Excel or Google Sheets use File › Save as / Download › CSV.');
      return;
    }
    const parsed = parseCsv(await file.text());
    if (parsed.length < 2) {
      toast.error('That file has no data rows');
      return;
    }
    setFileName(file.name);
    setHeaders(parsed[0]);
    setData(parsed.slice(1));
    setMapping(guessMapping(parsed[0]));
    setStep('map');
  };

  const runPreview = async () => {
    setBusy(true);
    try {
      const out: ImportPreviewRow[] = [];
      for (let i = 0; i < rows.length; i += CHUNK) {
        const part = await candidateApi.previewImport(rows.slice(i, i + CHUNK));
        out.push(...part.map((p) => ({ ...p, index: p.index + i })));
        setProgress(Math.min(100, Math.round(((i + CHUNK) / rows.length) * 100)));
      }
      setPreview(out);
      setStep('review');
    } catch (err) {
      toast.error('Couldn’t check for duplicates', errorMessage(err, 'Please try again.'));
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const runImport = async () => {
    setBusy(true);
    const total: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const part = await candidateApi.importCandidates(rows.slice(i, i + CHUNK), strategy, jobId || undefined);
        total.created += part.created;
        total.updated += part.updated;
        total.skipped += part.skipped;
        total.errors.push(...part.errors.map((e) => ({ ...e, row: e.row + i })));
        setProgress(Math.min(100, Math.round(((i + CHUNK) / rows.length) * 100)));
      }
      setResult(total);
      setStep('done');
      queryClient.invalidateQueries({ queryKey: queryKeys.candidates });
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    } catch (err) {
      toast.error('Import failed', errorMessage(err, 'Please try again.'));
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const dupCount = preview.filter((p) => p.duplicates.length).length;
  const invalidCount = preview.filter((p) => !p.valid).length;

  const footer =
    step === 'map' ? (
      <>
        <Button variant="ghost" onClick={() => setStep('upload')}>
          Back
        </Button>
        <Button variant="primary" disabled={!hasName} loading={busy} onClick={runPreview}>
          {busy ? `Checking… ${progress}%` : `Check ${rows.length} rows for duplicates`}
        </Button>
      </>
    ) : step === 'review' ? (
      <>
        <Button variant="ghost" onClick={() => setStep('map')}>
          Back
        </Button>
        <Button variant="primary" loading={busy} onClick={runImport}>
          {busy ? `Importing… ${progress}%` : `Run import · ${rows.length - invalidCount} rows`}
        </Button>
      </>
    ) : step === 'done' ? (
      <Button variant="primary" onClick={onClose}>
        Done
      </Button>
    ) : undefined;

  return (
    <Modal title="Import candidates" description={fileName || 'From a CSV export of Recruit CRM, Bullhorn, LinkedIn or a spreadsheet'} onClose={onClose} size="xl" footer={footer}>
      {/* Steps */}
      <ol className="mb-5 flex items-center gap-2 text-2xs font-medium">
        {(['upload', 'map', 'review', 'done'] as Step[]).map((s, i) => (
          <li key={s} className={`flex items-center gap-2 ${step === s ? 'text-foreground' : 'text-subtle-foreground'}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full ring-1 ring-inset ${step === s ? 'bg-brand text-white ring-brand' : 'ring-border'}`}>{i + 1}</span>
            {['Upload', 'Map columns', 'Review', 'Done'][i]}
            {i < 3 && <span className="h-px w-6 bg-border" />}
          </li>
        ))}
      </ol>

      {step === 'upload' && (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onFile(e.dataTransfer.files?.[0]);
          }}
          className="flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-border-strong px-6 py-16 text-center transition-colors hover:border-brand/50 hover:bg-muted/50"
        >
          <Icon name="upload" size={28} className="text-subtle-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">Drop a CSV file here, or click to choose</p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            The first row must be column headers. Excel files: use File › Save as › CSV first. Up to 5,000 rows per file is fastest.
          </p>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </button>
      )}

      {step === 'map' && (
        <div>
          <p className="mb-3 text-xs text-muted-foreground">
            {data.length} rows found. We matched what we could — check each column. Unmapped columns are ignored.
            {!hasName && <span className="ml-1 font-medium text-brand-text">Map a full name, or both first and last name.</span>}
          </p>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted text-2xs uppercase tracking-wide text-subtle-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Column in file</th>
                  <th className="px-3 py-2 font-medium">Sample</th>
                  <th className="px-3 py-2 font-medium">Import as</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {headers.map((h, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 font-medium text-foreground">{h || <em className="text-subtle-foreground">(blank)</em>}</td>
                    <td className="max-w-[16rem] truncate px-3 py-2 text-muted-foreground">{data.find((r) => r[i]?.trim())?.[i] ?? '—'}</td>
                    <td className="w-56 px-3 py-1.5">
                      <Select value={mapping[i] ?? ''} onChange={(e) => setMapping((m) => ({ ...m, [i]: e.target.value }))} className="!h-8 !text-xs">
                        <option value="">— Ignore —</option>
                        {FIELDS.map((f) => (
                          <option key={f.key} value={f.key} disabled={mappedKeys.includes(f.key) && mapping[i] !== f.key}>
                            {f.label}
                          </option>
                        ))}
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border p-3">
              <p className="text-2xs uppercase tracking-wide text-subtle-foreground">Rows</p>
              <p className="text-xl font-semibold text-foreground">{rows.length}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-2xs uppercase tracking-wide text-subtle-foreground">Possible duplicates</p>
              <p className="text-xl font-semibold text-foreground">{dupCount}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-2xs uppercase tracking-wide text-subtle-foreground">Missing a name</p>
              <p className={`text-xl font-semibold ${invalidCount ? 'text-brand-text' : 'text-foreground'}`}>{invalidCount}</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-[13px] font-medium text-foreground">
              When a row matches an existing candidate
              <Select value={strategy} onChange={(e) => setStrategy(e.target.value as typeof strategy)} className="mt-1.5">
                <option value="skip">Skip it (safest)</option>
                <option value="update">Merge into the existing record</option>
                <option value="create">Create a new record anyway</option>
              </Select>
            </label>
            <label className="text-[13px] font-medium text-foreground">
              Link every imported candidate to a role
              <Select value={jobId} onChange={(e) => setJobId(e.target.value)} className="mt-1.5">
                <option value="">Don’t link</option>
                {jobs.map((j) => (
                  <option key={j._id} value={j._id}>
                    {j.title}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <div className="max-h-72 overflow-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-muted text-2xs uppercase tracking-wide text-subtle-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Check</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {preview.slice(0, 300).map((p) => {
                  const r = rows[p.index];
                  const name = (r.name as string) || [r.firstName, r.lastName].filter(Boolean).join(' ');
                  const d = p.duplicates[0];
                  return (
                    <tr key={p.index}>
                      <td className="px-3 py-1.5 tabular-nums text-subtle-foreground">{p.index + 1}</td>
                      <td className="px-3 py-1.5 text-foreground">{name || '—'}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{(r.email as string) || '—'}</td>
                      <td className="px-3 py-1.5">
                        {!p.valid ? (
                          <Badge tone="danger">No name</Badge>
                        ) : d ? (
                          <span title={`${d.firstName} ${d.lastName} · ${d.email ?? ''}`}>
                            <Badge tone="warning">Matches on {d.matchedOn.join(', ')}</Badge>
                          </span>
                        ) : (
                          <Badge tone="success">New</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {preview.length > 300 && <p className="px-3 py-2 text-2xs text-subtle-foreground">Showing the first 300 of {preview.length} rows.</p>}
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="space-y-4 py-4 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
            <Icon name="check" size={22} />
          </span>
          <p className="text-sm font-medium text-foreground">Import complete</p>
          <p className="text-[13px] text-muted-foreground">
            {result.created} created · {result.updated} merged · {result.skipped} skipped
            {result.errors.length > 0 && ` · ${result.errors.length} failed`}
          </p>
          {result.errors.length > 0 && (
            <ul className="mx-auto max-h-40 max-w-md overflow-auto rounded-md border border-border text-left text-xs">
              {result.errors.slice(0, 50).map((e) => (
                <li key={e.row} className="border-b border-border px-3 py-1.5 last:border-0">
                  <span className="font-medium text-foreground">Row {e.row}:</span> <span className="text-muted-foreground">{e.error}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
