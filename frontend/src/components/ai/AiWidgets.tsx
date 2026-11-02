import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { aiApi, CandidateBrief, MatchResult, ParsedResume, RankedCandidate } from '../../api/ai.api';
import { useAiStatus } from '../../hooks/useAi';
import { errorMessage } from '../../utils/errors';
import { useToast } from '../shared/Toast';
import Button from '../shared/Button';
import Icon from '../shared/Icon';
import Badge, { BadgeTone } from '../shared/Badge';
import { Field, Input, Select, Textarea } from '../shared/Field';
import Modal from '../shared/Modal';
import { Candidate } from '../../types';
import { ProfileForm } from '../candidates/ProfileFieldsEditor';

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

/** "AI · gpt-4o-mini" chip; turns amber with a tooltip when the provider is unreachable. */
export function AiChip({ className = '' }: { className?: string }) {
  const { data } = useAiStatus();
  if (!data) return null;
  return (
    <span
      title={data.available ? `Powered by ${data.provider === 'openai' ? 'OpenAI' : 'Ollama (local)'}` : data.detail}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium ${
        data.available ? 'bg-brand-subtle text-brand-text' : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
      } ${className}`}
    >
      <Icon name="sparkles" size={11} />
      {data.available ? data.model : 'AI offline'}
    </span>
  );
}

/** Hide AI entry points entirely when the backend reports the provider down. */
export function useAiAvailable() {
  const { data } = useAiStatus();
  return { available: !!data?.available, detail: data?.detail, loaded: !!data };
}

const VERDICT_TONE: Record<MatchResult['verdict'], BadgeTone> = {
  STRONG: 'success',
  GOOD: 'info',
  PARTIAL: 'warning',
  WEAK: 'danger',
};

function scoreTone(score: number): BadgeTone {
  return score >= 80 ? 'success' : score >= 65 ? 'info' : score >= 45 ? 'warning' : 'danger';
}

function BulletList({ items, icon, tone }: { items: string[]; icon: 'check' | 'alert' | 'message'; tone: string }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-1.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2 text-[13px] text-foreground">
          <Icon name={icon} size={14} className={`mt-0.5 shrink-0 ${tone}`} />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function SubHead({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 mt-3 text-2xs font-semibold uppercase tracking-wide text-subtle-foreground">{children}</p>;
}

// ---------------------------------------------------------------------------
// Candidate page: AI brief + role fit
// ---------------------------------------------------------------------------

export function CandidateAiPanel({ candidate }: { candidate: Candidate }) {
  const toast = useToast();
  const { available, detail, loaded } = useAiAvailable();
  const links = candidate.jobLinks || [];
  const [jobId, setJobId] = useState(links[0]?.jobId || '');
  const [brief, setBrief] = useState<CandidateBrief | null>(null);
  const [match, setMatch] = useState<{ jobId: string; result: MatchResult } | null>(null);

  const briefMut = useMutation({
    mutationFn: () => aiApi.summarize(candidate._id, jobId || undefined),
    onSuccess: setBrief,
    onError: (err) => toast.error('Couldn’t generate a brief', errorMessage(err, 'Please try again.')),
  });
  const matchMut = useMutation({
    mutationFn: () => aiApi.match(candidate._id, jobId),
    onSuccess: (result) => setMatch({ jobId, result }),
    onError: (err) => toast.error('Couldn’t assess fit', errorMessage(err, 'Please try again.')),
  });

  if (!loaded) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <Icon name="sparkles" size={15} className="text-brand-text" />
          AI insights
        </h3>
        <AiChip />
      </div>

      {!available ? (
        <p className="mt-3 text-[13px] text-muted-foreground">AI is unavailable right now. {detail}</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            {links.length > 0 && (
              <div className="min-w-[200px] flex-1">
                <Field label="For role">
                  {(fid) => (
                    <Select id={fid} value={jobId} onChange={(e) => setJobId(e.target.value)}>
                      {links.map((l) => (
                        <option key={l.jobId} value={l.jobId}>
                          {l.jobTitle}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
            )}
            <Button size="sm" icon="file" loading={briefMut.isPending} onClick={() => briefMut.mutate()}>
              {brief ? 'Regenerate brief' : 'Generate brief'}
            </Button>
            {jobId && (
              <Button size="sm" variant="primary" icon="sparkles" loading={matchMut.isPending} onClick={() => matchMut.mutate()}>
                Assess fit
              </Button>
            )}
          </div>

          {match && match.jobId === jobId && <MatchView result={match.result} />}

          {brief && (
            <div className="mt-4 border-t border-border pt-4">
              {brief.headline && <p className="text-sm font-semibold text-foreground">{brief.headline}</p>}
              {brief.summary && <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{brief.summary}</p>}
              {brief.highlights.length > 0 && (
                <>
                  <SubHead>Highlights</SubHead>
                  <BulletList items={brief.highlights} icon="check" tone="text-emerald-600" />
                </>
              )}
              {brief.considerations.length > 0 && (
                <>
                  <SubHead>To probe</SubHead>
                  <BulletList items={brief.considerations} icon="alert" tone="text-amber-600" />
                </>
              )}
            </div>
          )}
          <p className="mt-3 text-2xs text-subtle-foreground">AI output can be wrong. Verify before acting on it.</p>
        </>
      )}
    </div>
  );
}

export function MatchView({ result }: { result: MatchResult }) {
  return (
    <div className="mt-4 rounded-md border border-border bg-muted/40 p-4">
      <div className="flex items-center gap-3">
        <div className="text-[28px] font-semibold leading-none tabular-nums text-foreground">{result.score}</div>
        <div>
          <Badge tone={VERDICT_TONE[result.verdict]}>{result.verdict.toLowerCase()} fit</Badge>
          <div className="mt-1.5 h-1.5 w-40 overflow-hidden rounded-full bg-border">
            <div className="h-full rounded-full bg-brand" style={{ width: `${result.score}%` }} />
          </div>
        </div>
      </div>
      {result.summary && <p className="mt-3 text-[13px] leading-relaxed text-foreground">{result.summary}</p>}
      {result.strengths.length > 0 && (
        <>
          <SubHead>Strengths</SubHead>
          <BulletList items={result.strengths} icon="check" tone="text-emerald-600" />
        </>
      )}
      {result.gaps.length > 0 && (
        <>
          <SubHead>Gaps</SubHead>
          <BulletList items={result.gaps} icon="alert" tone="text-amber-600" />
        </>
      )}
      {result.interviewQuestions.length > 0 && (
        <>
          <SubHead>Suggested interview questions</SubHead>
          <BulletList items={result.interviewQuestions} icon="message" tone="text-brand-text" />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Submission note drafting (admin)
// ---------------------------------------------------------------------------

export function DraftNoteButton({ candidateId, jobId, onDraft }: { candidateId: string; jobId: string; onDraft: (note: string) => void }) {
  const toast = useToast();
  const { available } = useAiAvailable();
  const mut = useMutation({
    mutationFn: () => aiApi.submissionNote(candidateId, jobId),
    onSuccess: (r) => onDraft(r.note),
    onError: (err) => toast.error('Couldn’t draft a note', errorMessage(err, 'Please try again.')),
  });
  if (!available) return null;
  return (
    <Button type="button" size="sm" variant="ghost" icon="sparkles" loading={mut.isPending} onClick={() => mut.mutate()}>
      Draft with AI
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Job description writer (both roles)
// ---------------------------------------------------------------------------

export function JdWriterButton({
  title,
  department,
  location,
  workType,
  existing,
  onWrite,
}: {
  title: string;
  department?: string;
  location?: string;
  workType?: string;
  existing?: string;
  onWrite: (description: string) => void;
}) {
  const toast = useToast();
  const { available } = useAiAvailable();
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState('');
  const mut = useMutation({
    mutationFn: (improve: boolean) =>
      aiApi.jobDescription({ title, department, location, workType, brief: brief.trim() || undefined, existing: improve ? existing : undefined }),
    onSuccess: (r) => {
      onWrite(r.description);
      setOpen(false);
      toast.success('Description drafted', 'Review and edit before saving.');
    },
    onError: (err) => toast.error('Couldn’t write the description', errorMessage(err, 'Please try again.')),
  });
  if (!available) return null;
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        icon="sparkles"
        onClick={() => (title.trim() ? setOpen(true) : toast.info('Add a title first', 'The AI needs the role title to write from.'))}
      >
        Write with AI
      </Button>
      {open && (
        <Modal
          title="Write job description"
          description={title}
          onClose={() => setOpen(false)}
          centered
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              {existing?.trim() && (
                <Button loading={mut.isPending && mut.variables === true} disabled={mut.isPending} onClick={() => mut.mutate(true)}>
                  Improve current draft
                </Button>
              )}
              <Button variant="primary" icon="sparkles" loading={mut.isPending && mut.variables === false} disabled={mut.isPending} onClick={() => mut.mutate(false)}>
                Write new
              </Button>
            </>
          }
        >
          <Field label="Notes for the AI" hint="optional · must-haves, team, seniority, tech stack">
            {(fid) => (
              <Textarea
                id={fid}
                rows={5}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="e.g. Senior, 6+ yrs React/TypeScript, owns the design system, small team of 4, hybrid 2 days/week."
                autoFocus
              />
            )}
          </Field>
          <p className="mt-2 text-xs text-muted-foreground">The draft replaces the description field. You can still edit it before saving.</p>
        </Modal>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Résumé autofill (admin)
// ---------------------------------------------------------------------------

export interface BasicCandidateFields {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  currentTitle: string;
  currentCompany: string;
  location: string;
  skills: string;
  linkedinUrl: string;
  website: string;
  currentlyWorking: 'yes' | 'no';
}

/** Fills only empty fields, so autofill never overwrites what a recruiter typed. Returns how many fields it filled. */
export function mergeParsed(
  parsed: ParsedResume,
  basic: BasicCandidateFields,
  profile: ProfileForm
): { basic: BasicCandidateFields; profile: ProfileForm; filled: number } {
  let filled = 0;
  const b = { ...basic };
  const p = { ...profile };
  const setB = (k: Exclude<keyof BasicCandidateFields, 'currentlyWorking'>, v?: string) => {
    if (v && !b[k].trim()) {
      b[k] = v;
      filled++;
    }
  };
  setB('firstName', parsed.firstName);
  setB('lastName', parsed.lastName);
  setB('email', parsed.email);
  setB('phone', parsed.phone);
  setB('currentTitle', parsed.currentTitle);
  setB('currentCompany', parsed.currentCompany);
  setB('location', parsed.location);
  setB('linkedinUrl', parsed.linkedinUrl);
  setB('website', parsed.website);
  if (parsed.skills.length && !b.skills.trim()) {
    b.skills = parsed.skills.join(', ');
    filled++;
  }
  if (parsed.currentlyWorking === false) b.currentlyWorking = 'no';
  if (parsed.yearsExperience != null && !p.yearsExperience) {
    p.yearsExperience = String(parsed.yearsExperience);
    filled++;
  }
  if (parsed.languages.length && !p.languages.trim()) {
    p.languages = parsed.languages.join(', ');
    filled++;
  }
  if (parsed.education.length && !p.education.length) {
    p.education = parsed.education;
    filled++;
  }
  if (parsed.certifications.length && !p.certifications.length) {
    p.certifications = parsed.certifications;
    filled++;
  }
  if (parsed.employmentHistory.length && !p.employmentHistory.length) {
    p.employmentHistory = parsed.employmentHistory;
    filled++;
  }
  return { basic: b, profile: p, filled };
}

/**
 * Banner with "Autofill from résumé". With `candidateId`, parses the résumé already on file;
 * otherwise the recruiter picks a file (which is passed back so the form can attach it too).
 */
export function ResumeAutofill({
  candidateId,
  hasResume,
  onParsed,
}: {
  candidateId?: string;
  hasResume?: boolean;
  onParsed: (parsed: ParsedResume, file?: File) => void;
}) {
  const toast = useToast();
  const { available } = useAiAvailable();
  const inputRef = useRef<HTMLInputElement>(null);
  const mut = useMutation({
    mutationFn: async (file?: File) => ({
      parsed: file ? await aiApi.parseResumeFile(file) : await aiApi.parseCandidateResume(candidateId!),
      file,
    }),
    onSuccess: ({ parsed, file }) => onParsed(parsed, file),
    onError: (err) => toast.error('Couldn’t read the résumé', errorMessage(err, 'Please try again.')),
  });
  if (!available) return null;
  const useStored = !!candidateId && hasResume;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-brand/40 bg-brand-subtle/40 px-3 py-2.5">
      <p className="flex items-center gap-2 text-[13px] text-foreground">
        <Icon name="sparkles" size={14} className="text-brand-text" />
        {useStored ? 'Fill empty fields from the résumé on file' : 'Upload a résumé and AI fills the form'}
      </p>
      <div className="flex gap-1">
        {useStored && (
          <Button type="button" size="sm" variant="primary" loading={mut.isPending && !mut.variables} onClick={() => mut.mutate(undefined)}>
            Autofill
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant={useStored ? 'ghost' : 'primary'}
          icon="upload"
          loading={mut.isPending && !!mut.variables}
          disabled={mut.isPending}
          onClick={() => inputRef.current?.click()}
        >
          {useStored ? 'Other file' : 'Upload résumé'}
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          if (!/\.(pdf|docx)$/i.test(f.name)) return toast.error('Résumé must be a .pdf or .docx file');
          mut.mutate(f);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Role: AI-ranked matches from the talent pool (admin)
// ---------------------------------------------------------------------------

export function RankedMatches({ jobId, onOpen }: { jobId: string; onOpen: (candidateId: string) => void }) {
  const toast = useToast();
  const { available, detail, loaded } = useAiAvailable();
  const [results, setResults] = useState<RankedCandidate[] | null>(null);
  const mut = useMutation({
    mutationFn: () => aiApi.rankPool(jobId, 10),
    onSuccess: (r) => setResults(r.results),
    onError: (err) => toast.error('Couldn’t find matches', errorMessage(err, 'Please try again.')),
  });
  if (!loaded) return null;
  if (!available) return <p className="text-[13px] text-muted-foreground">AI is unavailable right now. {detail}</p>;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">
          Ranks your open talent pool against this role. Candidates already on the role are left out.
        </p>
        <div className="flex items-center gap-2">
          <AiChip />
          <Button size="sm" variant="primary" icon="sparkles" loading={mut.isPending} onClick={() => mut.mutate()}>
            {results ? 'Re-run' : 'Find best matches'}
          </Button>
        </div>
      </div>
      {mut.isPending && <p className="mt-4 text-[13px] text-muted-foreground">Reviewing candidates. This can take up to a minute…</p>}
      {results && !mut.isPending && (
        <ul className="mt-4 divide-y divide-border rounded-md border border-border">
          {results.length === 0 && <li className="p-4 text-[13px] text-muted-foreground">No candidates in the pool to rank.</li>}
          {results.map((r) => (
            <li key={r.candidateId}>
              <button
                type="button"
                onClick={() => onOpen(r.candidateId)}
                className="flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-muted"
              >
                <Badge tone={scoreTone(r.score)} className="mt-0.5 tabular-nums">
                  {r.score}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-foreground">{r.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[r.currentTitle, r.currentCompany, r.location].filter(Boolean).join(' · ')}
                  </p>
                  {r.reason && <p className="mt-1 text-xs text-foreground">{r.reason}</p>}
                </div>
                <Icon name="arrow-right" size={14} className="mt-1 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Talent search: plain-English → filters (admin)
// ---------------------------------------------------------------------------

export function AiSearchBar({ onApply }: { onApply: (filters: Record<string, string>, explanation: string) => void }) {
  const toast = useToast();
  const { available } = useAiAvailable();
  const [query, setQuery] = useState('');
  const [explanation, setExplanation] = useState('');
  const mut = useMutation({
    mutationFn: () => aiApi.search(query.trim()),
    onSuccess: (r) => {
      const flat: Record<string, string> = {};
      Object.entries(r.filters).forEach(([k, v]) => {
        flat[k] = Array.isArray(v) ? v.join(',') : String(v);
      });
      setExplanation(r.explanation);
      onApply(flat, r.explanation);
    },
    onError: (err) => toast.error('Couldn’t interpret that search', errorMessage(err, 'Please try again.')),
  });
  if (!available) return null;
  return (
    <form
      className="rounded-md border border-dashed border-brand/40 bg-brand-subtle/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (query.trim()) mut.mutate();
      }}
    >
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Icon name="sparkles" size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-text" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Describe who you need, e.g. "senior React devs in Austin, 5+ years, can join within 30 days"'
            className="pl-8"
            aria-label="Describe the candidate you're looking for"
          />
        </div>
        <Button type="submit" variant="primary" size="md" loading={mut.isPending} disabled={!query.trim()}>
          Search with AI
        </Button>
      </div>
      {explanation && !mut.isPending && <p className="mt-2 text-xs text-muted-foreground">{explanation}</p>}
    </form>
  );
}
