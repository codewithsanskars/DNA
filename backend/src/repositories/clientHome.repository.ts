import { AppDataSource } from '../config/data-source';
import { Application, Job } from '../entities';
import { CandidateStage } from '../types';

const apps = () => AppDataSource.getRepository(Application);
const jobs = () => AppDataSource.getRepository(Job);

const STAGES: CandidateStage[] = ['APPLIED', 'SCREENING', 'SUBMITTED', 'SHORTLISTED', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'];

/** Read models for the client home page — always scoped to one client org. */
export const clientHomeRepository = {
  /** Candidates SWFS has submitted that the client hasn't decided on yet. */
  awaitingReview: async (organizationId: string) => {
    const rows = await apps()
      .createQueryBuilder('a')
      .innerJoinAndSelect('a.candidate', 'c')
      .innerJoinAndSelect('a.job', 'j')
      .where('j."organizationId" = :organizationId', { organizationId })
      .andWhere('a.stage = :stage', { stage: 'SUBMITTED' })
      .orderBy('a.submittedAt', 'DESC', 'NULLS LAST')
      .take(30)
      .getMany();
    return rows.map((a) => ({
      applicationId: a.id,
      candidateId: a.candidate.id,
      name: `${a.candidate.firstName} ${a.candidate.lastName}`,
      currentTitle: a.candidate.currentTitle ?? undefined,
      currentCompany: a.candidate.currentCompany ?? undefined,
      location: a.candidate.location ?? undefined,
      yearsExperience: a.candidate.yearsExperience != null ? Number(a.candidate.yearsExperience) : undefined,
      noticePeriod: a.candidate.noticePeriod ?? undefined,
      availableFrom: a.candidate.availableFrom ?? undefined,
      skills: a.candidate.skills ?? [],
      photoUrl: a.candidate.photoUrl ? `/api/candidates/${a.candidate.id}/photo` : undefined,
      syncedAt: a.candidate.updatedAt,
      jobId: a.job.id,
      jobTitle: a.job.title,
      submittedAt: a.submittedAt ?? undefined,
      submissionNote: a.submissionNote ?? undefined,
      clientViewedAt: a.clientViewedAt ?? undefined,
    }));
  },

  /** The org's roles with per-stage counts, newest first. */
  rolesWithPipeline: async (organizationId: string) => {
    const roleRows = await jobs().find({
      where: { organization: { id: organizationId } },
      relations: ['owner'],
      order: { createdAt: 'DESC' },
    });
    const counts: { jobId: string; stage: CandidateStage; count: string }[] = await apps()
      .createQueryBuilder('a')
      .innerJoin('a.job', 'j')
      .select('j.id', 'jobId')
      .addSelect('a.stage', 'stage')
      .addSelect('COUNT(*)', 'count')
      .where('j."organizationId" = :organizationId', { organizationId })
      .groupBy('j.id')
      .addGroupBy('a.stage')
      .getRawMany();
    return roleRows.map((j) => {
      const byStage = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<CandidateStage, number>;
      for (const c of counts.filter((x) => x.jobId === j.id)) byStage[c.stage] = Number(c.count);
      return {
        id: j.id,
        title: j.title,
        department: j.department ?? undefined,
        location: j.location ?? undefined,
        status: j.status,
        priority: j.priority,
        openedAt: j.openedAt ?? j.createdAt,
        owner: j.owner ? { id: j.owner.id, name: j.owner.name, email: j.owner.email } : null,
        stageCounts: byStage,
      };
    });
  },
};
