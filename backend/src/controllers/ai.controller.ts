import fs from 'fs';
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { aiService } from '../services/ai.service';
import { activeModel, activeProvider, llm } from '../services/llm.service';
import { auditLogService } from '../services/auditLog.service';
import { matchService, scoreCandidate } from '../services/match.service';
import { jobService } from '../services/job.service';
import { jobRepository } from '../repositories/job.repository';
import { candidateRepository } from '../repositories/candidate.repository';
import { badRequest, notFound, optionalNumber, optionalString, optionalUuid, orgScopeOf, requiredString } from '../utils/http';

type Handler = (req: AuthenticatedRequest, res: Response) => Promise<unknown>;
const wrap = (fn: Handler) => async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await fn(req, res) });
  } catch (err) {
    next(err);
  }
};

const uuid = (v: unknown, label: string) => {
  const id = optionalUuid(v, label);
  if (!id) throw badRequest(`${label} is required`);
  return id;
};

export const aiController = {
  status: wrap(async () => {
    const health = await llm.health();
    return { provider: activeProvider(), model: activeModel(), available: health.ok, detail: health.detail };
  }),

  /** Upload a résumé file → structured profile (file isn't kept). For the "new candidate" form. */
  parseResumeUpload: wrap(async (req) => {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) throw badRequest('Attach a résumé (.pdf or .docx)');
    try {
      return await aiService.parseResumeFile(file.path);
    } finally {
      fs.promises.unlink(file.path).catch(() => undefined);
    }
  }),

  parseResumeText: wrap(async (req) => aiService.parseResume(requiredString(req.body?.text, 'Résumé text', 60000))),

  parseCandidateResume: wrap(async (req) => aiService.parseCandidateResume(uuid(req.params.id, 'Candidate'))),

  match: wrap(async (req) => {
    const candidateId = uuid(req.body?.candidateId, 'Candidate');
    const jobId = uuid(req.body?.jobId, 'Role');
    const result = await aiService.matchCandidateToJob(candidateId, jobId, orgScopeOf(req));
    await auditLogService.log(req.user!, 'AI_MATCH', 'candidate', candidateId, { jobId, score: result.score });
    return result;
  }),

  rankPool: wrap(async (req) => {
    const limit = optionalNumber(req.body?.limit, 'Limit', { min: 1, max: 20, integer: true }) ?? 10;
    return aiService.rankPoolForJob(uuid(req.params.jobId, 'Role'), limit);
  }),

  summarize: wrap(async (req) =>
    aiService.summarizeCandidate(
      uuid(req.params.id, 'Candidate'),
      orgScopeOf(req),
      optionalUuid(req.body?.jobId, 'Role') ?? undefined
    )
  ),

  submissionNote: wrap(async (req) =>
    aiService.draftSubmissionNote(uuid(req.params.id, 'Candidate'), uuid(req.body?.jobId, 'Role'))
  ),

  jobDescription: wrap(async (req) =>
    aiService.writeJobDescription({
      title: requiredString(req.body?.title, 'Title', 200),
      brief: optionalString(req.body?.brief, 'Brief', 4000),
      department: optionalString(req.body?.department, 'Department', 200),
      location: optionalString(req.body?.location, 'Location', 200),
      workType: optionalString(req.body?.workType, 'Work type', 50),
      existing: optionalString(req.body?.existing, 'Existing description', 20000),
    })
  ),

  /**
   * AI view of a role: summary + extracted requirements for both roles. The
   * pool match count is SWFS-only, since clients never see the talent pool.
   */
  jobInsights: wrap(async (req) => {
    const job = await jobService.getJobById(uuid(req.params.jobId, 'Role'), orgScopeOf(req));
    if (!job) throw notFound('Role not found');
    const insights = orgScopeOf(req) ? null : await matchService.poolInsights(job);
    const fresh = await jobRepository.findById(job.id);
    return {
      jobId: job.id,
      summary: fresh?.aiSummary ?? null,
      requirements: insights?.requirements ?? fresh?.aiRequirements ?? null,
      analyzedAt: fresh?.aiAnalyzedAt ?? null,
      ...(insights ? { matchCount: insights.matchCount, strongCount: insights.strongCount, poolSize: insights.poolSize, threshold: insights.threshold } : {}),
    };
  }),

  analyzeJob: wrap(async (req) => {
    const job = await jobService.getJobById(uuid(req.params.jobId, 'Role'), orgScopeOf(req));
    if (!job) throw notFound('Role not found');
    const updated: any = await matchService.analyzeJob(job.id);
    return { summary: updated?.aiSummary ?? null, requirements: updated?.aiRequirements ?? null, analyzedAt: updated?.aiAnalyzedAt ?? null };
  }),

  /** SWFS dashboard: roles opened in the last N days, each with its AI summary and live pool match count. */
  newOpenings: wrap(async (req) => {
    const days = optionalNumber(req.query.days, 'Days', { min: 1, max: 90, integer: true }) ?? 14;
    const [jobs, pool] = await Promise.all([jobRepository.findRecentOpen(days, 8), candidateRepository.findMatchPool({ masterPool: true })]);
    return Promise.all(
      jobs.map(async (job) => {
        const insights = await matchService.poolInsights(job, pool).catch(() => null);
        const fresh = insights ? await jobRepository.findById(job.id) : job;
        return {
          id: job.id,
          title: job.title,
          organizationName: job.organizationName,
          location: job.location,
          priority: job.priority,
          openedAt: job.openedAt ?? job.createdAt,
          totalCandidates: job.totalCandidates,
          summary: fresh?.aiSummary ?? null,
          mustHaveSkills: (insights?.requirements.mustHaveSkills ?? []).slice(0, 6),
          matchCount: insights?.matchCount ?? null,
          strongCount: insights?.strongCount ?? null,
        };
      })
    );
  }),

  /**
   * JD match for a profile that isn't saved yet (Chrome extension). Same scorer
   * as everywhere else, so the % agrees with the portal after saving.
   */
  matchPreview: wrap(async (req) => {
    const job = await jobService.getJobById(uuid(req.body?.jobId, 'Role'), null);
    if (!job) throw notFound('Role not found');
    const p = req.body?.profile ?? {};
    const requirements = await matchService.requirementsFor(job);
    const match = scoreCandidate(
      {
        id: 'preview',
        currentTitle: typeof p.currentTitle === 'string' ? p.currentTitle.slice(0, 200) : undefined,
        location: typeof p.location === 'string' ? p.location.slice(0, 200) : undefined,
        skills: Array.isArray(p.skills) ? p.skills.slice(0, 100).map(String) : [],
        yearsExperience: Number.isFinite(Number(p.yearsExperience)) ? Number(p.yearsExperience) : undefined,
        employmentHistory: Array.isArray(p.employmentHistory) ? p.employmentHistory.slice(0, 30) : [],
      },
      requirements
    );
    return { jobId: job.id, jobTitle: job.title, ...match };
  }),

  search: wrap(async (req) => aiService.naturalLanguageSearch(requiredString(req.body?.query, 'Search', 1000))),
};
