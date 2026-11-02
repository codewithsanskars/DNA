import path from 'path';
import { llm } from './llm.service';
import { extractText } from './ai.service';
import { jobRepository } from '../repositories/job.repository';
import { candidateRepository, CandidateSearchParams } from '../repositories/candidate.repository';
import { JOB_DESCRIPTION_DIR } from '../middleware/upload.middleware';
import { notFound } from '../utils/http';

/**
 * JD match engine.
 *
 * One LLM call per role turns the JD into structured requirements, cached on
 * the job. Every match % (role cards, new-openings widget, talent search
 * filter, exports) then comes from the deterministic scorer below. It's
 * instant over thousands of candidates, gives the same number everywhere,
 * and is explainable ("5 of 7 must-have skills"). The LLM "Assess fit" in
 * ai.service is the deep dive for a single candidate.
 */

export interface JobRequirements {
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  titles: string[];
  minYears?: number;
  location?: string;
  remote?: boolean;
  /** 'ai' when extracted by the LLM, 'keywords' for the no-LLM fallback. */
  method: 'ai' | 'keywords';
}

export interface MatchBreakdown {
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  titleMatch: boolean;
  experienceOk: boolean | null;
  locationOk: boolean | null;
}

/** A candidate at or above this % counts as a "match" in counts and badges. */
export const MATCH_THRESHOLD = 60;

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

const ALIASES: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  'node.js': 'node',
  nodejs: 'node',
  'react.js': 'react',
  reactjs: 'react',
  'vue.js': 'vue',
  vuejs: 'vue',
  'next.js': 'nextjs',
  k8s: 'kubernetes',
  postgres: 'postgresql',
  psql: 'postgresql',
  golang: 'go',
  'c sharp': 'c#',
  csharp: 'c#',
  'amazon web services': 'aws',
  gcp: 'google cloud',
  ml: 'machine learning',
  ai: 'artificial intelligence',
  'ci/cd': 'cicd',
  'ci cd': 'cicd',
  py: 'python',
};

export function normSkill(s: string): string {
  const t = s.toLowerCase().replace(/[^a-z0-9+#./ ]/g, ' ').replace(/\s+/g, ' ').trim();
  return ALIASES[t] ?? t;
}

const STOP_TITLE = new Set(['senior', 'sr', 'junior', 'jr', 'lead', 'principal', 'staff', 'the', 'and', 'of', 'i', 'ii', 'iii', 'a']);
const titleTokens = (t: string) =>
  t
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((w) => w.length > 1 && !STOP_TITLE.has(w));

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

interface PoolCandidate {
  id: string;
  currentTitle?: string | null;
  location?: string | null;
  skills: string[];
  yearsExperience?: number;
  employmentHistory?: { title?: string }[];
}

function skillHit(req: string, have: Set<string>, haystack: string): boolean {
  if (have.has(req)) return true;
  // Multi-word or longer skills: also accept a containment match ("react" ⊂ "react native" is NOT accepted the other way).
  for (const h of have) if (h.length > 2 && (h === req || h.startsWith(`${req} `) || h.endsWith(` ${req}`))) return true;
  return req.length > 3 && haystack.includes(req);
}

export function scoreCandidate(c: PoolCandidate, r: JobRequirements): MatchBreakdown {
  const have = new Set((c.skills || []).map(normSkill));
  const titles = [c.currentTitle, ...(c.employmentHistory || []).map((e) => e.title)].filter(Boolean) as string[];
  const haystack = ` ${[...have].join(' ')} ${titles.join(' ').toLowerCase()} `;

  const must = r.mustHaveSkills.map(normSkill);
  const nice = r.niceToHaveSkills.map(normSkill);
  const matchedMust = must.filter((s) => skillHit(s, have, haystack));
  const matchedNice = nice.filter((s) => skillHit(s, have, haystack));

  // Title: best token overlap between any of the candidate's titles and any target title.
  let titleRatio = 0;
  for (const target of r.titles) {
    const tt = titleTokens(target);
    if (!tt.length) continue;
    for (const ct of titles) {
      const cset = new Set(titleTokens(ct));
      const ratio = tt.filter((w) => cset.has(w)).length / tt.length;
      if (ratio > titleRatio) titleRatio = ratio;
    }
  }

  const yrs = c.yearsExperience;
  const experienceOk = r.minYears == null ? null : yrs == null ? null : yrs >= r.minYears;
  const expRatio = r.minYears == null || r.minYears <= 0 ? 1 : yrs == null ? 0.5 : Math.min(1, yrs / r.minYears);

  const locationOk =
    r.remote || !r.location
      ? null
      : !c.location
        ? null
        : r.location
            .toLowerCase()
            .split(/[,/]| or /)
            .map((x) => x.trim())
            .filter((x) => x.length > 1)
            .some((part) => c.location!.toLowerCase().includes(part) || part.includes(c.location!.toLowerCase()));
  const locRatio = locationOk === null ? 0.6 : locationOk ? 1 : 0;

  // Weights adapt to what the JD actually specifies.
  const parts: [number, number][] = [];
  if (must.length) parts.push([0.55, matchedMust.length / must.length]);
  if (nice.length) parts.push([0.1, matchedNice.length / nice.length]);
  if (r.titles.length) parts.push([0.2, titleRatio]);
  parts.push([0.1, expRatio]);
  if (r.location && !r.remote) parts.push([0.05, locRatio]);
  const wsum = parts.reduce((a, [w]) => a + w, 0);
  const score = Math.round((parts.reduce((a, [w, v]) => a + w * v, 0) / wsum) * 100);

  return {
    score,
    matchedSkills: [...r.mustHaveSkills.filter((_, i) => matchedMust.includes(must[i])), ...r.niceToHaveSkills.filter((_, i) => matchedNice.includes(nice[i]))],
    missingSkills: r.mustHaveSkills.filter((_, i) => !matchedMust.includes(must[i])),
    titleMatch: titleRatio >= 0.5,
    experienceOk,
    locationOk,
  };
}

// ---------------------------------------------------------------------------
// Requirement extraction
// ---------------------------------------------------------------------------

async function jobText(job: any): Promise<string> {
  let fileText = '';
  const file = await jobRepository.getDescriptionFile(job.id);
  if (file) {
    try {
      fileText = await extractText(path.join(JOB_DESCRIPTION_DIR, path.basename(file.storedName)));
    } catch {
      /* unreadable file — fall back to the typed description */
    }
  }
  return [`Title: ${job.title}`, job.location && `Location: ${job.location}`, job.workType && `Work type: ${job.workType}`, job.description, fileText]
    .filter(Boolean)
    .join('\n')
    .slice(0, 12000);
}

const cleanList = (v: unknown, n: number) =>
  Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim()).filter((x) => x && x.length <= 60))].slice(0, n) : [];

async function extractWithLlm(text: string): Promise<{ summary: string; req: JobRequirements }> {
  const out = await llm.json<any>([
    {
      role: 'system',
      content: `You analyse job descriptions for a recruiting agency. Return JSON:
{"summary":"2 sentences: what the role is and what kind of person fits",
"mustHaveSkills":["concrete skills/tools/technologies explicitly required, max 10, short canonical names e.g. 'React', 'AWS'"],
"niceToHaveSkills":["preferred/bonus skills, max 8"],
"titles":["the job title plus 1-3 equivalent titles a matching candidate might hold"],
"minYears":number|null,"location":string|null,"remote":boolean}
Only include what the text supports. Skills must be skills, not soft traits like "communication".`,
    },
    { role: 'user', content: text },
  ]);
  const minYears = Number(out?.minYears);
  return {
    summary: String(out?.summary || '').trim().slice(0, 600),
    req: {
      mustHaveSkills: cleanList(out?.mustHaveSkills, 10),
      niceToHaveSkills: cleanList(out?.niceToHaveSkills, 8),
      titles: cleanList(out?.titles, 4),
      minYears: Number.isFinite(minYears) && minYears > 0 && minYears < 40 ? minYears : undefined,
      location: typeof out?.location === 'string' && out.location.trim() ? out.location.trim().slice(0, 120) : undefined,
      remote: out?.remote === true,
      method: 'ai',
    },
  };
}

/** No-LLM fallback: skills from the database vocabulary that appear in the JD text. */
async function extractWithKeywords(job: any, text: string): Promise<JobRequirements> {
  const vocab = await candidateRepository.skillVocabulary();
  const hay = ` ${text.toLowerCase().replace(/[^a-z0-9+#./ ]/g, ' ').replace(/\s+/g, ' ')} `;
  const found = vocab
    .filter((s) => s.length > 1 && hay.includes(` ${s} `))
    .sort((a, b) => b.length - a.length)
    .slice(0, 10);
  const yrs = text.match(/(\d{1,2})\s*\+?\s*(?:years|yrs)/i);
  return {
    mustHaveSkills: found,
    niceToHaveSkills: [],
    titles: [job.title],
    minYears: yrs ? Number(yrs[1]) : undefined,
    location: job.location || undefined,
    remote: /remote/i.test(`${job.location ?? ''} ${job.workType ?? ''}`),
    method: 'keywords',
  };
}

function readRequirements(job: any): JobRequirements | null {
  const r = job?.aiRequirements;
  if (!r || !Array.isArray(r.mustHaveSkills)) return null;
  return {
    mustHaveSkills: r.mustHaveSkills,
    niceToHaveSkills: r.niceToHaveSkills ?? [],
    titles: r.titles?.length ? r.titles : [job.title],
    minYears: r.minYears ?? undefined,
    location: r.location ?? undefined,
    remote: !!r.remote,
    method: r.method === 'ai' ? 'ai' : 'keywords',
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const inFlight = new Map<string, Promise<unknown>>();

export const matchService = {
  /** (Re)analyse a role: AI summary + requirements, with a keyword fallback if the LLM is down. */
  analyzeJob: async (jobId: string) => {
    if (inFlight.has(jobId)) return inFlight.get(jobId);
    const run = (async () => {
      const job = await jobRepository.findById(jobId);
      if (!job) throw notFound('Role not found');
      const text = await jobText(job);
      let summary: string | null = null;
      let req: JobRequirements;
      try {
        const out = await extractWithLlm(text);
        summary = out.summary || null;
        req = out.req.mustHaveSkills.length || out.req.titles.length ? out.req : await extractWithKeywords(job, text);
      } catch (err) {
        console.warn(`[match] AI analysis failed for job ${jobId}, using keyword fallback:`, (err as Error).message);
        req = await extractWithKeywords(job, text);
      }
      await jobRepository.setAiAnalysis(jobId, { aiSummary: summary, aiRequirements: req as unknown as Record<string, unknown> });
      return jobRepository.findById(jobId);
    })().finally(() => inFlight.delete(jobId));
    inFlight.set(jobId, run);
    return run;
  },

  /** Fire-and-forget analysis after a role is created or its JD changes. */
  analyzeInBackground: (jobId: string) => {
    matchService.analyzeJob(jobId).catch((err) => console.warn(`[match] analyze ${jobId} failed:`, err?.message));
  },

  /** Requirements for a role, analysing on first use. */
  requirementsFor: async (job: any): Promise<JobRequirements> => {
    const cached = readRequirements(job);
    if (cached) return cached;
    const fresh = await matchService.analyzeJob(job.id);
    return readRequirements(fresh) ?? { mustHaveSkills: [], niceToHaveSkills: [], titles: [job.title], method: 'keywords' };
  },

  /** How many open-pool candidates (not already on the role) clear the match threshold. */
  poolInsights: async (job: any, sharedPool?: PoolCandidate[]) => {
    const req = await matchService.requirementsFor(job);
    const [pool, linked] = await Promise.all([
      sharedPool ?? candidateRepository.findMatchPool({ masterPool: true }),
      candidateRepository.linkedCandidateIds(job.id),
    ]);
    const scores = pool.filter((c) => !linked.has(c.id)).map((c) => scoreCandidate(c, req).score);
    return {
      matchCount: scores.filter((s) => s >= MATCH_THRESHOLD).length,
      strongCount: scores.filter((s) => s >= 80).length,
      poolSize: scores.length,
      threshold: MATCH_THRESHOLD,
      requirements: req,
    };
  },

  /**
   * Talent search ranked by JD match: apply the normal filters, score every
   * hit, drop those under `minMatch`, sort best-first, then page.
   */
  searchWithMatch: async (params: CandidateSearchParams, jobId: string, minMatch = 0) => {
    const job = await jobRepository.findById(jobId);
    if (!job) throw notFound('Role not found');
    const req = await matchService.requirementsFor(job);
    const pool = await candidateRepository.findMatchPool({ ...params, page: undefined, pageSize: undefined });
    const scored = pool
      .map((c) => ({ id: c.id, m: scoreCandidate(c, req) }))
      .filter((x) => x.m.score >= minMatch)
      .sort((a, b) => b.m.score - a.m.score);
    const pageSize = Math.min(Math.max(params.pageSize ?? 25, 1), 200);
    const page = Math.max(params.page ?? 1, 1);
    const slice = scored.slice((page - 1) * pageSize, page * pageSize);
    const byId = new Map(slice.map((x) => [x.id, x.m]));
    const items = (await candidateRepository.findManyOrdered(slice.map((x) => x.id))).map((c) => ({ ...c, match: byId.get(c.id) }));
    return {
      items,
      total: scored.length,
      page,
      pageSize,
      matchJob: { id: job.id, title: job.title, requirements: req },
    };
  },
};
