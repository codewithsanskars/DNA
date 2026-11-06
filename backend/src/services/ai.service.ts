import path from 'path';
import fs from 'fs';
import { llm, ChatMessage } from './llm.service';
import { candidateService } from './candidate.service';
import { jobService } from './job.service';
import { candidateRepository } from '../repositories/candidate.repository';
import { jobRepository } from '../repositories/job.repository';
import { RESUME_DIR, JOB_DESCRIPTION_DIR } from '../middleware/upload.middleware';
import { badRequest, notFound } from '../utils/http';
import { WORK_AUTHORIZATIONS } from '../entities/enums';

const MAX_DOC_CHARS = 14000; // keeps prompts inside small local-model contexts

// ---------------------------------------------------------------------------
// Document text extraction (PDF / DOCX)
// ---------------------------------------------------------------------------

export async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  const buf = await fs.promises.readFile(filePath);
  let text = '';
  if (ext === '.pdf') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require('pdf-parse');
    text = (await pdfParse(buf)).text || '';
  } else if (ext === '.docx') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mammoth = require('mammoth');
    text = (await mammoth.extractRawText({ buffer: buf })).value || '';
  } else {
    text = buf.toString('utf8');
  }
  return text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

const clip = (s: string, n = MAX_DOC_CHARS) => (s.length > n ? `${s.slice(0, n)}\n…[truncated]` : s);

async function resumeTextFor(candidateId: string): Promise<string> {
  const file = await candidateRepository.getResumeFile(candidateId);
  if (!file) return '';
  try {
    return await extractText(path.join(RESUME_DIR, path.basename(file.storedName)));
  } catch {
    return '';
  }
}

async function jdFileTextFor(jobId: string): Promise<string> {
  const file = await jobRepository.getDescriptionFile(jobId);
  if (!file) return '';
  try {
    return await extractText(path.join(JOB_DESCRIPTION_DIR, path.basename(file.storedName)));
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Prompt-safe projections. Clients' requests never send compensation, tags,
// owner or internal notes to the model, so none of it can leak into output.
// ---------------------------------------------------------------------------

function candidateProfile(c: any, { includeInternal }: { includeInternal: boolean }) {
  const base: Record<string, unknown> = {
    name: `${c.firstName} ${c.lastName}`.trim(),
    currentTitle: c.currentTitle,
    currentCompany: c.currentCompany,
    location: c.location,
    yearsExperience: c.yearsExperience,
    skills: c.skills,
    employmentHistory: c.employmentHistory,
    education: c.education,
    certifications: c.certifications,
    languages: c.languages,
    noticePeriodDays: c.noticePeriod,
    availableFrom: c.availableFrom,
    workAuthorization: c.workAuthorization,
  };
  if (includeInternal) {
    base.expectedCtc = c.expectedCtc != null ? `${c.expectedCtc} ${c.ctcCurrency}` : undefined;
    base.recruiterNotes = c.notes;
  }
  return Object.fromEntries(Object.entries(base).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length)));
}

async function jobContext(job: any): Promise<string> {
  const fileText = job.description && job.description.length > 400 ? '' : await jdFileTextFor(job.id);
  return clip(
    [
      `Title: ${job.title}`,
      job.department && `Department: ${job.department}`,
      job.location && `Location: ${job.location}`,
      job.workType && `Work type: ${job.workType}`,
      job.description && `Description:\n${job.description}`,
      fileText && `Attached JD:\n${fileText}`,
    ]
      .filter(Boolean)
      .join('\n'),
    8000
  );
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

export interface MatchResult {
  score: number;
  verdict: 'STRONG' | 'GOOD' | 'PARTIAL' | 'WEAK';
  summary: string;
  strengths: string[];
  gaps: string[];
  interviewQuestions: string[];
}

function normalizeMatch(raw: any): MatchResult {
  const score = Math.max(0, Math.min(100, Math.round(Number(raw?.score) || 0)));
  const verdict = score >= 80 ? 'STRONG' : score >= 65 ? 'GOOD' : score >= 45 ? 'PARTIAL' : 'WEAK';
  const list = (v: unknown, n: number) =>
    (Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean).slice(0, n);
  return {
    score,
    verdict,
    summary: String(raw?.summary || '').trim(),
    strengths: list(raw?.strengths, 5),
    gaps: list(raw?.gaps, 5),
    interviewQuestions: list(raw?.interviewQuestions, 5),
  };
}

const MATCH_SYSTEM = `You are a senior technical recruiter. Evaluate how well a candidate fits a role.
Be evidence-based: only cite facts present in the candidate data. Never invent experience.
Never mention or infer age, gender, ethnicity, religion, nationality, marital status, disability or other protected traits.
Return JSON: {"score": 0-100, "summary": "2 sentences", "strengths": ["..."], "gaps": ["..."], "interviewQuestions": ["3 targeted questions probing the gaps"]}`;

/** Keyword overlap used to pre-rank the pool before the (slower) LLM pass. */
function keywordScore(c: any, terms: Set<string>): number {
  const hay = [c.currentTitle, c.currentCompany, ...(c.skills || []), ...(c.employmentHistory || []).map((e: any) => e.title)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  let hits = 0;
  terms.forEach((t) => {
    if (hay.includes(t)) hits++;
  });
  return hits;
}

const STOP = new Set(
  'the and for with you our are will this that from have your who can all role team work years experience strong ability skills job including using within across about into such well able must should'.split(' ')
);

export const aiService = {
  /** RC-29: parse a résumé into the structured candidate profile. Admin-only. */
  parseResume: async (text: string) => {
    if (!text.trim()) throw badRequest('No readable text found in the résumé');
    const out = await llm.json<any>(
      [
        {
          role: 'system',
          content: `Extract structured candidate data from a résumé. Use only information present. Unknown → null or [].
Return JSON with exactly these keys:
{"firstName":string|null,"lastName":string|null,"email":string|null,"phone":string|null,"location":string|null,
"linkedinUrl":string|null,"website":string|null,"currentTitle":string|null,"currentCompany":string|null,"currentlyWorking":boolean|null,
"yearsExperience":number|null,"skills":[string],"languages":[string],
"employmentHistory":[{"company":string,"title":string|null,"startDate":"YYYY-MM"|null,"endDate":"YYYY-MM"|null,"current":boolean}],
"education":[{"institution":string,"degree":string|null,"field":string|null,"startYear":number|null,"endYear":number|null}],
"certifications":[{"name":string,"issuer":string|null,"issuedAt":"YYYY-MM-DD"|null,"expiresAt":"YYYY-MM-DD"|null}],
"summary":"3-sentence professional summary"}
Employment history most recent first. Skills: up to 25 concise, deduplicated items.`,
        },
        { role: 'user', content: clip(text) },
      ],
      { maxTokens: 2500 }
    );
    return sanitizeParsed(out);
  },

  parseResumeFile: async (filePath: string) => aiService.parseResume(await extractText(filePath)),

  /** Parse the résumé already stored on a candidate. */
  parseCandidateResume: async (candidateId: string) => {
    const text = await resumeTextFor(candidateId);
    if (!text) throw badRequest('This candidate has no readable résumé on file');
    return aiService.parseResume(text);
  },

  /** Fit of one candidate to one role. Clients may only score their own linked candidates/roles. */
  matchCandidateToJob: async (candidateId: string, jobId: string, orgScope: string | null): Promise<MatchResult> => {
    const [candidate, job] = await Promise.all([
      candidateService.getCandidateById(candidateId, orgScope),
      jobService.getJobById(jobId, orgScope),
    ]);
    if (!candidate) throw notFound('Candidate not found');
    if (!job) throw notFound('Role not found');
    const isAdmin = orgScope === null;
    const resume = await resumeTextFor(candidateId);
    const raw = await llm.json([
      { role: 'system', content: MATCH_SYSTEM },
      {
        role: 'user',
        content: `ROLE\n${await jobContext(job)}\n\nCANDIDATE PROFILE\n${JSON.stringify(
          candidateProfile(candidate, { includeInternal: isAdmin })
        )}${resume ? `\n\nRÉSUMÉ TEXT\n${clip(resume, 6000)}` : ''}`,
      },
    ]);
    return normalizeMatch(raw);
  },

  /** Rank the talent pool for a role (admin sourcing). Pre-filters by keywords, then LLM-scores the top N. */
  rankPoolForJob: async (jobId: string, limit = 10) => {
    const job = await jobService.getJobById(jobId, null);
    if (!job) throw notFound('Role not found');
    const ctx = await jobContext(job);
    const terms = new Set(
      ctx
        .toLowerCase()
        .split(/[^a-z0-9+#.]+/)
        .filter((t) => t.length > 2 && !STOP.has(t))
    );
    const pool = await candidateRepository.search({ masterPool: true, pageSize: 200, sort: 'updated' });
    const linked = new Set<string>();
    const candidates = (pool.items as any[]).filter((c) => {
      const isLinked = (c.jobLinks || []).some((a: any) => a.jobId === jobId);
      if (isLinked) linked.add(c.id);
      return !isLinked;
    });
    const shortlist = candidates
      .map((c) => ({ c, k: keywordScore(c, terms) }))
      .sort((a, b) => b.k - a.k)
      .slice(0, Math.min(Math.max(limit, 1), 20))
      .map((x) => x.c);
    if (!shortlist.length) return { jobId, results: [] };

    const raw = await llm.json<any>(
      [
        {
          role: 'system',
          content: `You are a senior recruiter ranking candidates for a role. Use only the data given; never infer protected traits.
Return JSON: {"results":[{"id":"candidate id","score":0-100,"reason":"one sentence citing concrete evidence"}]} covering every candidate.`,
        },
        {
          role: 'user',
          content: `ROLE\n${ctx}\n\nCANDIDATES\n${JSON.stringify(
            shortlist.map((c) => ({ id: c.id, ...candidateProfile(c, { includeInternal: true }) }))
          )}`,
        },
      ],
      { maxTokens: 2500 }
    );
    const byId = new Map(shortlist.map((c) => [c.id, c]));
    const results = (Array.isArray(raw?.results) ? raw.results : [])
      .filter((r: any) => byId.has(String(r?.id)))
      .map((r: any) => {
        const c = byId.get(String(r.id));
        return {
          candidateId: c.id,
          name: `${c.firstName} ${c.lastName}`.trim(),
          currentTitle: c.currentTitle,
          currentCompany: c.currentCompany,
          location: c.location,
          score: Math.max(0, Math.min(100, Math.round(Number(r.score) || 0))),
          reason: String(r.reason || '').trim(),
        };
      })
      .sort((a: any, b: any) => b.score - a.score);
    return { jobId, results };
  },

  /** Recruiter-quality summary of a candidate. Client callers get a client-safe version. */
  summarizeCandidate: async (candidateId: string, orgScope: string | null, jobId?: string) => {
    const candidate = await candidateService.getCandidateById(candidateId, orgScope);
    if (!candidate) throw notFound('Candidate not found');
    const job = jobId ? await jobService.getJobById(jobId, orgScope) : null;
    if (jobId && !job) throw notFound('Role not found');
    const resume = await resumeTextFor(candidateId);
    const feedback = ((candidate as any).feedback || []).slice(0, 10).map((f: any) => ({ rating: f.rating, comment: f.comment }));
    const out = await llm.json<any>([
      {
        role: 'system',
        content: `Write a concise, factual candidate brief for a hiring manager. Only use given facts. No protected traits. No compensation.
Return JSON: {"headline":"one line","summary":"3-4 sentences","highlights":["3-5 bullets"],"considerations":["0-3 risks or open questions"]}`,
      },
      {
        role: 'user',
        content: `${job ? `ROLE\n${await jobContext(job)}\n\n` : ''}CANDIDATE\n${JSON.stringify(
          candidateProfile(candidate, { includeInternal: false })
        )}${feedback.length ? `\n\nFEEDBACK SO FAR\n${JSON.stringify(feedback)}` : ''}${
          resume ? `\n\nRÉSUMÉ\n${clip(resume, 6000)}` : ''
        }`,
      },
    ]);
    const list = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 5) : []);
    return {
      headline: String(out?.headline || ''),
      summary: String(out?.summary || ''),
      highlights: list(out?.highlights),
      considerations: list(out?.considerations),
    };
  },

  /** Admin: drafts the note that accompanies a submission to the client. */
  draftSubmissionNote: async (candidateId: string, jobId: string) => {
    const [candidate, job] = await Promise.all([
      candidateService.getCandidateById(candidateId, null),
      jobService.getJobById(jobId, null),
    ]);
    if (!candidate) throw notFound('Candidate not found');
    if (!job) throw notFound('Role not found');
    const note = await llm.chat(
      [
        {
          role: 'system',
          content:
            'You write short submission notes from a recruiting agency to a client hiring manager. 80-120 words, plain text, no greeting or sign-off, no salary figures, only facts from the data. Lead with why this person fits the role.',
        },
        {
          role: 'user',
          content: `ROLE\n${await jobContext(job)}\n\nCANDIDATE\n${JSON.stringify(candidateProfile(candidate, { includeInternal: false }))}`,
        },
      ],
      { temperature: 0.4, maxTokens: 400 }
    );
    return { note };
  },

  /** Generate or improve a job description from a brief. Both roles. */
  writeJobDescription: async (input: {
    title: string;
    brief?: string;
    department?: string;
    location?: string;
    workType?: string;
    existing?: string;
  }) => {
    const description = await llm.chat(
      [
        {
          role: 'system',
          content: `You write clear, inclusive job descriptions. Avoid gendered language, age cues and unnecessary degree requirements.
Use plain-text sections with these headings: About the role, What you'll do, What you'll bring, Nice to have. Use "- " bullets. 250-400 words. No salary unless given. Output only the description.`,
        },
        {
          role: 'user',
          content: [
            `Title: ${input.title}`,
            input.department && `Department: ${input.department}`,
            input.location && `Location: ${input.location}`,
            input.workType && `Work type: ${input.workType}`,
            input.brief && `Hiring manager's notes: ${input.brief}`,
            input.existing && `Improve this existing draft, keeping its facts:\n${clip(input.existing, 6000)}`,
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
      { temperature: 0.5, maxTokens: 1200 }
    );
    return { description };
  },

  /** Turns a plain-English ask into the talent-database filter set. Admin-only. */
  naturalLanguageSearch: async (query: string) => {
    const out = await llm.json<any>([
      {
        role: 'system',
        content: `Convert a recruiter's plain-English candidate search into filters. Return JSON with only the keys that apply:
{"q":"boolean keyword query using AND/OR/NOT/\\"phrases\\" for anything not covered by a filter",
"skills":[string],"title":string,"company":string,"location":string,"education":string,
"minExperience":number,"maxExperience":number,"maxNoticePeriod":number(days),"availableBy":"YYYY-MM-DD",
"workAuthorization":[one of ${WORK_AUTHORIZATIONS.join(', ')}],
"explanation":"one sentence describing the interpretation"}
Today is ${new Date().toISOString().slice(0, 10)}. Do not invent constraints the user didn't state.`,
      },
      { role: 'user', content: query },
    ]);
    return sanitizeSearch(out, query);
  },
};

// ---------------------------------------------------------------------------
// Output sanitizers — models drift from schemas; never trust shapes blindly.
// ---------------------------------------------------------------------------

const str = (v: unknown, max = 300) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const numOr = (v: unknown) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v));
const strList = (v: unknown, n = 50) =>
  Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim()).filter(Boolean))].slice(0, n) : [];
const ym = (v: unknown) => (typeof v === 'string' && /^\d{4}(-\d{2})?(-\d{2})?$/.test(v.trim()) ? v.trim() : undefined);

/** Total years from merged employment intervals (overlaps counted once). */
function yearsFromHistory(history: { startDate?: string; endDate?: string; current?: boolean }[]): number | undefined {
  const now = new Date();
  const toMonths = (v?: string) => {
    if (!v) return null;
    const [y, m] = v.split('-').map(Number);
    return y * 12 + ((m || 1) - 1);
  };
  const spans = history
    .map((e) => [toMonths(e.startDate), e.current || !e.endDate ? now.getFullYear() * 12 + now.getMonth() : toMonths(e.endDate)] as const)
    .filter((x): x is readonly [number, number] => x[0] != null && x[1] != null && x[1] >= x[0])
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const [a, b] of spans) {
    if (!cur || a > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [a, b];
    } else cur[1] = Math.max(cur[1], b);
  }
  if (cur) total += cur[1] - cur[0];
  return total ? Math.round((total / 12) * 10) / 10 : undefined;
}

function sanitizeParsed(o: any) {
  const out = sanitizeParsedRaw(o);
  // Small local models are unreliable at date arithmetic: a current role keeps
  // no end date, and years of experience comes from the dates, not the model.
  out.employmentHistory = out.employmentHistory.map((e) => (e.current ? { ...e, endDate: undefined } : e));
  const fromDates = yearsFromHistory(out.employmentHistory);
  if (fromDates !== undefined) out.yearsExperience = fromDates;
  return out;
}

function sanitizeParsedRaw(o: any) {
  const yrs = numOr(o?.yearsExperience);
  return {
    firstName: str(o?.firstName, 100),
    lastName: str(o?.lastName, 100),
    email: str(o?.email, 200),
    phone: str(o?.phone, 50),
    location: str(o?.location, 200),
    linkedinUrl: str(o?.linkedinUrl, 300),
    website: str(o?.website, 300),
    currentTitle: str(o?.currentTitle, 200),
    currentCompany: str(o?.currentCompany, 200),
    currentlyWorking: typeof o?.currentlyWorking === 'boolean' ? o.currentlyWorking : undefined,
    yearsExperience: yrs !== undefined && yrs >= 0 && yrs <= 70 ? Math.round(yrs * 10) / 10 : undefined,
    skills: strList(o?.skills, 25),
    languages: strList(o?.languages, 15),
    employmentHistory: (Array.isArray(o?.employmentHistory) ? o.employmentHistory : [])
      .filter((e: any) => str(e?.company))
      .slice(0, 20)
      .map((e: any) => ({
        company: str(e.company, 200)!,
        title: str(e.title, 200),
        startDate: ym(e.startDate),
        endDate: ym(e.endDate),
        current: !!e.current,
      })),
    education: (Array.isArray(o?.education) ? o.education : [])
      .filter((e: any) => str(e?.institution))
      .slice(0, 10)
      .map((e: any) => ({
        institution: str(e.institution, 200)!,
        degree: str(e.degree, 200),
        field: str(e.field, 200),
        startYear: numOr(e.startYear),
        endYear: numOr(e.endYear),
      })),
    certifications: (Array.isArray(o?.certifications) ? o.certifications : [])
      .filter((e: any) => str(e?.name))
      .slice(0, 20)
      .map((e: any) => ({ name: str(e.name, 200)!, issuer: str(e.issuer, 200), issuedAt: ym(e.issuedAt), expiresAt: ym(e.expiresAt) })),
    summary: str(o?.summary, 1500),
  };
}

/**
 * Models (especially small local ones) add constraints the user never asked
 * for. Keep a filter only if it's grounded in the query text.
 */
function sanitizeSearch(o: any, query: string) {
  const text = ` ${query.toLowerCase().replace(/[^a-z0-9+#.@ ]/g, ' ').replace(/\s+/g, ' ')} `;
  const words = (v: string) => v.toLowerCase().split(/[^a-z0-9+#.]+/).filter((w) => w.length > 1);
  // Every meaningful word of the value appears in the query (so "Austin" can't become a company).
  const grounded = (v: string) => {
    const ws = words(v).filter((w) => !['and', 'or', 'not', 'the', 'in', 'at', 'of'].includes(w));
    return ws.length > 0 && ws.every((w) => text.includes(` ${w} `) || text.includes(` ${w}s `) || text.includes(w));
  };
  const numbersInQuery = new Set((query.match(/\d+/g) || []).map(Number));
  const filters: Record<string, unknown> = {};

  // "PYTHON" -> "Python"; leaves normal casing and short acronyms like "AWS" alone.
  const tidy = (v: string) => (v.length > 3 && v === v.toUpperCase() ? v.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : v);
  for (const k of ['title', 'company', 'location', 'education']) {
    const v = str(o?.[k], 200);
    if (v && grounded(v)) filters[k] = tidy(v);
  }
  // A value used for one field shouldn't be reused for another (e.g. location also set as company).
  if (filters.company && filters.location && String(filters.company).toLowerCase() === String(filters.location).toLowerCase()) delete filters.company;
  // Keyword query: drop it if it's only operators or repeats the structured filters.
  const q = str(o?.q, 500);
  // A plain sentence copied from the input isn't a keyword query: with the
  // implicit AND it would match almost nothing.
  const isOperatorQuery = /\b(AND|OR|NOT)\b|"|\(/.test(q || '');
  if (
    q &&
    words(q).some((w) => !['and', 'or', 'not'].includes(w)) &&
    grounded(q.replace(/\b(AND|OR|NOT)\b|["()]/g, ' ')) &&
    (isOperatorQuery || words(q).length <= 3) &&
    !/\b(years?|yrs|least|within|days?)\b/i.test(q)
  )
    filters.q = q;

  // The skills filter requires every skill, so skills inside an OR query must
  // stay out of it ("java OR kotlin" must not become "java AND kotlin").
  const orTerms = /\bOR\b/.test(String(filters.q || '')) ? new Set(words(String(filters.q))) : new Set<string>();
  const skills = strList(o?.skills, 20)
    .filter(grounded)
    .filter((sk) => !words(sk).some((w) => orTerms.has(w)))
    .map(tidy);
  if (skills.length) filters.skills = skills;
  for (const k of ['minExperience', 'maxExperience', 'maxNoticePeriod']) {
    const n = numOr(o?.[k]);
    if (n !== undefined && n >= 0 && numbersInQuery.has(n)) filters[k] = n;
  }
  // "5+ years" means a minimum, never also a maximum.
  if (filters.minExperience != null && filters.maxExperience === filters.minExperience && /\+|more|at least|over|min/i.test(query)) delete filters.maxExperience;
  const by = ym(o?.availableBy);
  if (by && /\b(available|by|before|from|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|20\d\d)/i.test(query)) filters.availableBy = by;
  const wa = strList(o?.workAuthorization).filter((w) => (WORK_AUTHORIZATIONS as readonly string[]).includes(w));
  if (wa.length) filters.workAuthorization = wa;
  return { filters, explanation: str(o?.explanation, 500) || '' };
}

export type { ChatMessage };
