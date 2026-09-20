import { In, DeepPartial } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { Candidate, Application, CandidateFeedback, InterviewFeedback } from '../entities';
import { CANDIDATE_STAGES } from '../entities/enums';
import { CandidateStage, GlobalStatus, CandidateStatus } from '../types';

const repo = () => AppDataSource.getRepository(Candidate);
const appRepo = () => AppDataSource.getRepository(Application);
const interviewFeedbackRepo = () => AppDataSource.getRepository(InterviewFeedback);

const RELATIONS = [
  'applications',
  'applications.job',
  'applications.job.organization',
  'applications.interviewFeedback',
  'feedback',
];

function toDto(c: Candidate) {
  return {
    _id: c.id,
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    currentTitle: c.currentTitle,
    currentCompany: c.currentCompany,
    location: c.location,
    skills: c.skills,
    // Served through the authenticated download route, not a direct file path.
    resumeUrl: c.resumeUrl ? `/api/candidates/${c.id}/resume` : undefined,
    resumeFileName: c.resumeFileName,
    linkedinUrl: c.linkedinUrl,
    website: c.website,
    notes: c.notes,
    clientRating: c.clientRating,
    noticePeriod: c.noticePeriod,
    source: c.source,
    globalStatus: c.globalStatus,
    status: c.status,
    syncedAt: c.updatedAt,
    jobLinks: (c.applications || []).map((a) => ({
      jobId: a.job.id,
      jobTitle: a.job.title,
      stage: a.stage,
      organizationId: a.job.organization?.id,
      organizationName: a.job.organization?.name,
      interviewRound: a.interviewRound,
      interviewFeedback: (a.interviewFeedback || [])
        .map((f) => ({
          id: f.id,
          round: f.round,
          author: f.authorEmail,
          authorRole: f.authorRole,
          comment: f.comment,
          rating: f.rating,
          createdAt: f.createdAt,
        }))
        .sort((x, y) => x.round - y.round || x.createdAt.getTime() - y.createdAt.getTime()),
    })),
    feedback: (c.feedback || [])
      .map((f) => ({
        id: f.id,
        author: f.authorEmail,
        authorRole: f.authorRole,
        comment: f.comment,
        rating: f.rating,
        createdAt: f.createdAt,
      }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
  };
}

export const candidateRepository = {
  findAll: async () => {
    const candidates = await repo().find({ relations: RELATIONS, order: { createdAt: 'DESC' } });
    return candidates.map(toDto);
  },

  // Client view: only candidates actually linked to one of this org's roles.
  // A candidate has no org of its own — its only relationship to a client is
  // via the jobs (Applications) it's linked to. (Admin/recruiter callers use
  // findAll instead, which isn't scoped this way.)
  findByOrganization: async (organizationId: string) => {
    const rows = await appRepo()
      .createQueryBuilder('a')
      .innerJoin('a.candidate', 'c')
      .innerJoin('a.job', 'j')
      .where('j."organizationId" = :organizationId', { organizationId })
      .select('DISTINCT c.id', 'id')
      .getRawMany<{ id: string }>();

    const candidateIds = rows.map((r) => r.id);
    if (!candidateIds.length) return [];

    const candidates = await repo().find({
      where: { id: In(candidateIds) },
      relations: RELATIONS,
      order: { createdAt: 'DESC' },
    });
    return candidates.map(toDto);
  },

  // Callers are expected to have already verified job ownership (e.g. via
  // jobService.getJobById(jobId, orgScope)) before calling this.
  findByJob: async (jobId: string) => {
    const apps = await appRepo().find({ where: { job: { id: jobId } }, relations: ['candidate'] });
    const candidateIds = [...new Set(apps.map((a) => a.candidate.id))];
    if (!candidateIds.length) return [];
    const candidates = await repo().find({
      where: { id: In(candidateIds) },
      relations: RELATIONS,
      order: { createdAt: 'DESC' },
    });
    return candidates.map(toDto);
  },

  findById: async (id: string) => {
    const candidate = await repo().findOne({ where: { id }, relations: RELATIONS });
    return candidate ? toDto(candidate) : null;
  },

  // Same rule as findByOrganization: true only if the candidate is linked via
  // an Application to a job this org posted.
  isLinkedToOrganization: async (id: string, organizationId: string) => {
    const count = await appRepo()
      .createQueryBuilder('a')
      .innerJoin('a.candidate', 'c')
      .innerJoin('a.job', 'j')
      .where('c.id = :id', { id })
      .andWhere('j."organizationId" = :organizationId', { organizationId })
      .getCount();
    return count > 0;
  },

  create: async (data: any) => {
    const { jobLinks, rawData, ...rest } = data;
    const candidate = await repo().save(repo().create({ ...rest } as DeepPartial<Candidate>));
    for (const link of jobLinks || []) {
      await appRepo().save(
        appRepo().create({
          candidate: { id: candidate.id } as any,
          job: { id: link.jobId } as any,
          stage: (link.stage as CandidateStage) || 'APPLIED',
        })
      );
    }
    return candidateRepository.findById(candidate.id);
  },

  // Adds a job link if the candidate isn't already linked to that job, otherwise leaves it untouched.
  addJobLink: async (id: string, jobId: string, _jobTitle: string, stage: CandidateStage = 'APPLIED') => {
    const existing = await appRepo().findOne({ where: { candidate: { id }, job: { id: jobId } } });
    if (!existing) {
      await appRepo().save(
        appRepo().create({ candidate: { id } as any, job: { id: jobId } as any, stage })
      );
    }
    return candidateRepository.findById(id);
  },

  updateStageForJob: async (id: string, jobId: string, stage: CandidateStage) => {
    await appRepo()
      .createQueryBuilder()
      .update(Application)
      .set({ stage, stageUpdatedAt: new Date() })
      .where('candidateId = :id AND jobId = :jobId', { id, jobId })
      .execute();
    return candidateRepository.findById(id);
  },

  // Advances a role's interview round by one (0 -> 1 -> 2 -> 3), keeping
  // stage at 'INTERVIEW' throughout. Throws if the round is already at 3 —
  // callers past that point use the offer flow instead of another round.
  advanceInterviewRound: async (id: string, jobId: string) => {
    const application = await appRepo().findOne({ where: { candidate: { id }, job: { id: jobId } } });
    if (!application) throw new Error('Candidate is not linked to this role');
    if (application.interviewRound >= 3) throw new Error('All interview rounds have already been scheduled');

    await appRepo().update(application.id, {
      stage: 'INTERVIEW',
      stageUpdatedAt: new Date(),
      interviewRound: application.interviewRound + 1,
    });
    return candidateRepository.findById(id);
  },

  addInterviewFeedback: async (
    id: string,
    jobId: string,
    round: number,
    entry: { author: string; authorRole?: string; comment: string; rating?: number }
  ) => {
    const application = await appRepo().findOne({ where: { candidate: { id }, job: { id: jobId } } });
    if (!application) throw new Error('Candidate is not linked to this role');

    await interviewFeedbackRepo().save(
      interviewFeedbackRepo().create({
        application: { id: application.id } as any,
        round,
        authorEmail: entry.author,
        authorRole: entry.authorRole as any,
        comment: entry.comment,
        rating: entry.rating,
      })
    );
    return candidateRepository.findById(id);
  },

  addFeedback: async (
    id: string,
    entry: { author: string; authorRole?: string; comment: string; rating?: number }
  ) => {
    const feedbackRepo = AppDataSource.getRepository(CandidateFeedback);
    await feedbackRepo.save(
      feedbackRepo.create({
        candidate: { id } as any,
        authorEmail: entry.author,
        authorRole: entry.authorRole as any,
        comment: entry.comment,
        rating: entry.rating,
      })
    );
    return candidateRepository.findById(id);
  },

  updateDetails: async (id: string, data: Partial<Candidate>) => {
    await repo().update(id, data);
    return candidateRepository.findById(id);
  },

  updateRating: async (id: string, clientRating: number) => {
    await repo().update(id, { clientRating });
    return candidateRepository.findById(id);
  },

  updateGlobalStatus: async (id: string, globalStatus: GlobalStatus, status: CandidateStatus) => {
    await repo().update(id, { globalStatus, status });
    return candidateRepository.findById(id);
  },

  updateStatus: async (id: string, status: CandidateStatus) => {
    await repo().update(id, { status });
    return candidateRepository.findById(id);
  },

  // Returns the on-disk filename + original name for the download route, or
  // null if the candidate has no resume. Kept separate from toDto() since the
  // stored filename must never reach the client directly.
  getResumeFile: async (id: string) => {
    const candidate = await repo().findOne({
      where: { id },
      select: ['id', 'resumeUrl', 'resumeFileName'],
    });
    if (!candidate?.resumeUrl) return null;
    return { storedName: candidate.resumeUrl, fileName: candidate.resumeFileName };
  },

  setResume: async (id: string, storedName: string, fileName: string) => {
    await repo().update(id, { resumeUrl: storedName, resumeFileName: fileName });
    return candidateRepository.findById(id);
  },

  clearResume: async (id: string) => {
    // `update()` silently ignores `undefined`/`null` values, so set to NULL via query builder.
    await repo()
      .createQueryBuilder()
      .update(Candidate)
      .set({ resumeUrl: () => 'NULL', resumeFileName: () => 'NULL' })
      .where('id = :id', { id })
      .execute();
    return candidateRepository.findById(id);
  },

  // organizationId === null means "any client" — reserved for SWFS admin/recruiter callers.
  countByStage: async (organizationId: string | null) => {
    const counts: Record<string, number> = {};
    for (const stage of CANDIDATE_STAGES) counts[stage] = 0;

    const qb = appRepo()
      .createQueryBuilder('a')
      .innerJoin('a.job', 'j')
      .select('a.stage', 'stage')
      .addSelect('COUNT(*)', 'count')
      .groupBy('a.stage');
    if (organizationId) qb.andWhere('j."organizationId" = :organizationId', { organizationId });

    const rows = await qb.getRawMany<{ stage: string; count: string }>();
    for (const row of rows) counts[row.stage] = parseInt(row.count, 10);
    return counts;
  },
};
