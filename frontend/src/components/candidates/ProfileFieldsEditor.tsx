import { CertificationEntry, EducationEntry, EmploymentEntry, WorkAuthorization } from '../../types';
import { WORK_AUTH_LABELS } from '../../utils/labels';
import { useStaff } from '../../hooks/useWorkflow';
import { Field, Input, Select } from '../shared/Field';
import Button from '../shared/Button';
import Icon from '../shared/Icon';

/** Form state for the extended profile — strings for inputs, lists for repeaters. */
export interface ProfileForm {
  yearsExperience: string;
  availableFrom: string;
  workAuthorization: WorkAuthorization | '';
  languages: string;
  currentCtc: string;
  expectedCtc: string;
  ctcCurrency: string;
  tags: string;
  ownerId: string;
  education: EducationEntry[];
  certifications: CertificationEntry[];
  employmentHistory: EmploymentEntry[];
}

export const EMPTY_PROFILE_FORM: ProfileForm = {
  yearsExperience: '',
  availableFrom: '',
  workAuthorization: '',
  languages: '',
  currentCtc: '',
  expectedCtc: '',
  ctcCurrency: 'USD',
  tags: '',
  ownerId: '',
  education: [],
  certifications: [],
  employmentHistory: [],
};

const list = (v: string) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v));

export function profileFormFrom(c: {
  yearsExperience?: number;
  availableFrom?: string;
  workAuthorization?: WorkAuthorization;
  languages?: string[];
  currentCtc?: number;
  expectedCtc?: number;
  ctcCurrency?: string;
  tags?: string[];
  owner?: { id: string } | null;
  education?: EducationEntry[];
  certifications?: CertificationEntry[];
  employmentHistory?: EmploymentEntry[];
}): ProfileForm {
  return {
    yearsExperience: c.yearsExperience != null ? String(c.yearsExperience) : '',
    availableFrom: c.availableFrom?.slice(0, 10) ?? '',
    workAuthorization: c.workAuthorization ?? '',
    languages: (c.languages ?? []).join(', '),
    currentCtc: c.currentCtc != null ? String(c.currentCtc) : '',
    expectedCtc: c.expectedCtc != null ? String(c.expectedCtc) : '',
    ctcCurrency: c.ctcCurrency ?? 'USD',
    tags: (c.tags ?? []).join(', '),
    ownerId: c.owner?.id ?? '',
    education: c.education ?? [],
    certifications: c.certifications ?? [],
    employmentHistory: c.employmentHistory ?? [],
  };
}

/** Converts form state to the API payload. Returns an error string if invalid. */
export function profilePayload(f: ProfileForm): { error?: string; payload?: Record<string, unknown> } {
  for (const [label, v, max] of [
    ['Years of experience', f.yearsExperience, 70],
    ['Current CTC', f.currentCtc, 1e8],
    ['Expected CTC', f.expectedCtc, 1e8],
  ] as const) {
    if (v.trim() && (!Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > max)) return { error: `${label} must be a number between 0 and ${max}` };
  }
  return {
    payload: {
      yearsExperience: numOrNull(f.yearsExperience),
      availableFrom: f.availableFrom || null,
      workAuthorization: f.workAuthorization || null,
      languages: list(f.languages),
      currentCtc: numOrNull(f.currentCtc),
      expectedCtc: numOrNull(f.expectedCtc),
      ctcCurrency: f.ctcCurrency.trim().toUpperCase() || 'USD',
      tags: list(f.tags),
      ownerId: f.ownerId || null,
      education: f.education.filter((e) => e.institution.trim() || e.degree?.trim()),
      certifications: f.certifications.filter((c) => c.name.trim()),
      employmentHistory: f.employmentHistory.filter((e) => e.company.trim()),
    },
  };
}

function Repeater<T>({
  title,
  items,
  empty,
  onAdd,
  onRemove,
  render,
}: {
  title: string;
  items: T[];
  empty: string;
  onAdd: () => void;
  onRemove: (i: number) => void;
  render: (item: T, i: number) => JSX.Element;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[13px] font-medium text-foreground">{title}</p>
        <Button type="button" size="sm" variant="ghost" icon="plus" onClick={onAdd}>
          Add
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-subtle-foreground">{empty}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="relative rounded-md border border-border bg-muted/40 p-3 pr-9">
              {render(item, i)}
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={`Remove ${title.toLowerCase()} entry`}
                className="absolute right-2 top-2 rounded p-1 text-subtle-foreground hover:bg-muted hover:text-foreground"
              >
                <Icon name="close" size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Editor for the extended candidate profile. `isAdmin` reveals the
 * SWFS-internal fields (CTC, tags, owner) — the API ignores them from clients.
 */
export default function ProfileFieldsEditor({
  value,
  onChange,
  isAdmin,
  showHistory = true,
}: {
  value: ProfileForm;
  onChange: (next: ProfileForm) => void;
  isAdmin: boolean;
  showHistory?: boolean;
}) {
  const { data: staff = [] } = useStaff();
  const set = <K extends keyof ProfileForm>(k: K, v: ProfileForm[K]) => onChange({ ...value, [k]: v });
  const setItem = <K extends 'education' | 'certifications' | 'employmentHistory'>(k: K, i: number, patch: Partial<ProfileForm[K][number]>) =>
    onChange({ ...value, [k]: value[k].map((item, j) => (j === i ? { ...item, ...patch } : item)) });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Experience" hint="years">
          {(id) => <Input id={id} type="number" min={0} step={0.5} value={value.yearsExperience} onChange={(e) => set('yearsExperience', e.target.value)} />}
        </Field>
        <Field label="Available from">
          {(id) => <Input id={id} type="date" value={value.availableFrom} onChange={(e) => set('availableFrom', e.target.value)} />}
        </Field>
        <Field label="Work authorization">
          {(id) => (
            <Select id={id} value={value.workAuthorization} onChange={(e) => set('workAuthorization', e.target.value as WorkAuthorization | '')}>
              <option value="">—</option>
              {(Object.keys(WORK_AUTH_LABELS) as WorkAuthorization[]).map((w) => (
                <option key={w} value={w}>
                  {WORK_AUTH_LABELS[w]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <Field label="Languages" hint="comma-separated">
        {(id) => <Input id={id} value={value.languages} onChange={(e) => set('languages', e.target.value)} placeholder="e.g. English, Spanish" />}
      </Field>

      {isAdmin && (
        <div className="space-y-4 rounded-md border border-border p-3">
          <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle-foreground">
            <Icon name="alert" size={12} /> Internal — never shown to clients
          </p>
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_90px]">
            <Field label="Current CTC">
              {(id) => <Input id={id} type="number" min={0} value={value.currentCtc} onChange={(e) => set('currentCtc', e.target.value)} />}
            </Field>
            <Field label="Expected CTC">
              {(id) => <Input id={id} type="number" min={0} value={value.expectedCtc} onChange={(e) => set('expectedCtc', e.target.value)} />}
            </Field>
            <Field label="Currency">
              {(id) => <Input id={id} maxLength={3} value={value.ctcCurrency} onChange={(e) => set('ctcCurrency', e.target.value.toUpperCase())} />}
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tags" hint="comma-separated">
              {(id) => <Input id={id} value={value.tags} onChange={(e) => set('tags', e.target.value)} placeholder="e.g. hotlist, java-bench" />}
            </Field>
            <Field label="Owner">
              {(id) => (
                <Select id={id} value={value.ownerId} onChange={(e) => set('ownerId', e.target.value)}>
                  <option value="">Unassigned</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </div>
      )}

      {showHistory && (
        <>
          <Repeater
            title="Employment history"
            items={value.employmentHistory}
            empty="No previous employers added."
            onAdd={() => set('employmentHistory', [...value.employmentHistory, { company: '', title: '' }])}
            onRemove={(i) => set('employmentHistory', value.employmentHistory.filter((_, j) => j !== i))}
            render={(e, i) => (
              <div className="grid gap-2 sm:grid-cols-2">
                <Input placeholder="Company" value={e.company} onChange={(ev) => setItem('employmentHistory', i, { company: ev.target.value })} />
                <Input placeholder="Title" value={e.title ?? ''} onChange={(ev) => setItem('employmentHistory', i, { title: ev.target.value })} />
                <Input type="month" aria-label="Start" value={e.startDate?.slice(0, 7) ?? ''} onChange={(ev) => setItem('employmentHistory', i, { startDate: ev.target.value ? `${ev.target.value}-01` : undefined })} />
                <div className="flex items-center gap-2">
                  <Input
                    type="month"
                    aria-label="End"
                    disabled={e.current}
                    value={e.endDate?.slice(0, 7) ?? ''}
                    onChange={(ev) => setItem('employmentHistory', i, { endDate: ev.target.value ? `${ev.target.value}-01` : undefined })}
                  />
                  <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <input type="checkbox" checked={!!e.current} onChange={(ev) => setItem('employmentHistory', i, { current: ev.target.checked, endDate: undefined })} />
                    Current
                  </label>
                </div>
              </div>
            )}
          />
          <Repeater
            title="Education"
            items={value.education}
            empty="No education added."
            onAdd={() => set('education', [...value.education, { institution: '' }])}
            onRemove={(i) => set('education', value.education.filter((_, j) => j !== i))}
            render={(e, i) => (
              <div className="grid gap-2 sm:grid-cols-2">
                <Input placeholder="Institution" value={e.institution} onChange={(ev) => setItem('education', i, { institution: ev.target.value })} />
                <Input placeholder="Degree" value={e.degree ?? ''} onChange={(ev) => setItem('education', i, { degree: ev.target.value })} />
                <Input placeholder="Field of study" value={e.field ?? ''} onChange={(ev) => setItem('education', i, { field: ev.target.value })} />
                <div className="flex gap-2">
                  <Input type="number" placeholder="Start" value={e.startYear ?? ''} onChange={(ev) => setItem('education', i, { startYear: ev.target.value ? Number(ev.target.value) : undefined })} />
                  <Input type="number" placeholder="End" value={e.endYear ?? ''} onChange={(ev) => setItem('education', i, { endYear: ev.target.value ? Number(ev.target.value) : undefined })} />
                </div>
              </div>
            )}
          />
          <Repeater
            title="Certifications"
            items={value.certifications}
            empty="No certifications added."
            onAdd={() => set('certifications', [...value.certifications, { name: '' }])}
            onRemove={(i) => set('certifications', value.certifications.filter((_, j) => j !== i))}
            render={(c, i) => (
              <div className="grid gap-2 sm:grid-cols-2">
                <Input placeholder="Certification" value={c.name} onChange={(ev) => setItem('certifications', i, { name: ev.target.value })} />
                <Input placeholder="Issuer" value={c.issuer ?? ''} onChange={(ev) => setItem('certifications', i, { issuer: ev.target.value })} />
                <label className="text-2xs text-subtle-foreground">
                  Issued
                  <Input type="date" value={c.issuedAt?.slice(0, 10) ?? ''} onChange={(ev) => setItem('certifications', i, { issuedAt: ev.target.value || undefined })} />
                </label>
                <label className="text-2xs text-subtle-foreground">
                  Expires
                  <Input type="date" value={c.expiresAt?.slice(0, 10) ?? ''} onChange={(ev) => setItem('certifications', i, { expiresAt: ev.target.value || undefined })} />
                </label>
              </div>
            )}
          />
        </>
      )}
    </div>
  );
}
