import { DeepPartial } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { Job } from '../entities';

const repo = () => AppDataSource.getRepository(Job);

function toDto(job: Job) {
  return {
    _id: job.id,
    id: job.id,
    organizationId: job.organization?.id,
    title: job.title,
    department: job.department,
    location: job.location,
    status: job.status,
    priority: job.priority,
    totalCandidates: job.totalCandidates,
    openedAt: job.openedAt,
    syncedAt: job.updatedAt,
    description: job.description,
    // The pg driver returns numeric columns as strings to avoid float
    // precision loss — convert back to a number for the DTO.
    payRate: job.payRate != null ? Number(job.payRate) : undefined,
    billRate: job.billRate != null ? Number(job.billRate) : undefined,
    billableHours: job.billableHours,
    workType: job.workType,
    payrollType: job.payrollType,
    jdUrl: job.jdUrl ? `/api/jobs/${job.id}/description` : undefined,
    jdFileName: job.jdFileName,
    // The SWFS recruiter on the role — shown to clients as their point of contact.
    owner: job.owner ? { id: job.owner.id, name: job.owner.name, email: job.owner.email } : null,
    createdAt: job.createdAt,
    aiSummary: job.aiSummary ?? undefined,
    aiRequirements: job.aiRequirements ?? undefined,
    aiAnalyzedAt: job.aiAnalyzedAt ?? undefined,
  };
}

const RELATIONS = ['organization', 'owner'];

export const jobRepository = {
  findAll: async () => {
    const jobs = await repo().find({ relations: RELATIONS, order: { createdAt: 'DESC' } });
    return jobs.map(toDto);
  },

  findByOrganization: async (organizationId: string) => {
    const jobs = await repo().find({
      where: { organization: { id: organizationId } },
      relations: RELATIONS,
      order: { createdAt: 'DESC' },
    });
    return jobs.map(toDto);
  },

  /** Paged roles list; organizationId null = every client (admin). */
  findPage: async (opts: { organizationId: string | null; q?: string; status?: string; page: number; pageSize: number }) => {
    const qb = repo()
      .createQueryBuilder('job')
      .leftJoinAndSelect('job.organization', 'organization')
      .leftJoinAndSelect('job.owner', 'owner')
      .orderBy('job.createdAt', 'DESC')
      .skip((opts.page - 1) * opts.pageSize)
      .take(opts.pageSize);
    if (opts.organizationId) qb.andWhere('organization.id = :org', { org: opts.organizationId });
    if (opts.status) qb.andWhere('job.status = :status', { status: opts.status });
    if (opts.q) {
      qb.andWhere('(job.title ILIKE :q OR job.department ILIKE :q OR job.location ILIKE :q OR organization.name ILIKE :q)', {
        q: `%${opts.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`,
      });
    }
    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map(toDto), total, page: opts.page, pageSize: opts.pageSize };
  },

  findById: async (id: string) => {
    const job = await repo().findOne({ where: { id }, relations: RELATIONS });
    return job ? toDto(job) : null;
  },

  create: async (organizationId: string, data: any) => {
    const { rawData, ...rest } = data;
    const job = await repo().save(
      repo().create({ ...rest, organization: { id: organizationId } } as DeepPartial<Job>)
    );
    return jobRepository.findById(job.id);
  },

  countByOrganization: async (organizationId: string) =>
    repo().count({ where: { organization: { id: organizationId }, status: 'OPEN' } }),

  incrementCandidateCount: async (id: string, delta = 1) => {
    await repo().increment({ id }, 'totalCandidates', delta);
  },

  update: async (id: string, data: any) => {
    const { ownerId, ...rest } = data;
    if (ownerId !== undefined) rest.owner = ownerId ? { id: ownerId } : null;
    // Drop undefined keys — TypeORM's update() rejects an all-undefined set.
    for (const k of Object.keys(rest)) if (rest[k] === undefined) delete rest[k];
    if (Object.keys(rest).length) await repo().update(id, rest);
    return jobRepository.findById(id);
  },

  setAiAnalysis: async (id: string, data: { aiSummary: string | null; aiRequirements: Record<string, unknown>; }) => {
    await repo().update(id, { ...data, aiAnalyzedAt: new Date() } as DeepPartial<Job>);
  },

  /** Recently opened roles, newest first — for the "New openings" widget. */
  findRecentOpen: async (sinceDays: number, limit = 8) => {
    const since = new Date(Date.now() - sinceDays * 86400000);
    const jobs = await repo()
      .createQueryBuilder('job')
      .leftJoinAndSelect('job.organization', 'organization')
      .leftJoinAndSelect('job.owner', 'owner')
      .where('job.status = :s', { s: 'OPEN' })
      .andWhere('COALESCE(job."openedAt", job."createdAt") >= :since', { since })
      .orderBy('COALESCE(job."openedAt", job."createdAt")', 'DESC')
      .take(limit)
      .getMany();
    return jobs.map((j) => ({ ...toDto(j), organizationName: j.organization?.name }));
  },

  delete: async (id: string) => {
    await repo().delete(id);
  },

  // Returns the on-disk filename + original name for the download route, or
  // null if the job has no description on file. Kept separate from toDto()
  // since the stored filename must never reach the client directly.
  getDescriptionFile: async (id: string) => {
    const job = await repo().findOne({ where: { id }, select: ['id', 'jdUrl', 'jdFileName'] });
    if (!job?.jdUrl) return null;
    return { storedName: job.jdUrl, fileName: job.jdFileName };
  },

  setDescriptionFile: async (id: string, storedName: string, fileName: string) => {
    await repo().update(id, { jdUrl: storedName, jdFileName: fileName });
    return jobRepository.findById(id);
  },

  clearDescriptionFile: async (id: string) => {
    // `update()` silently ignores `undefined`/`null` values, so set to NULL via query builder.
    await repo()
      .createQueryBuilder()
      .update(Job)
      .set({ jdUrl: () => 'NULL', jdFileName: () => 'NULL' })
      .where('id = :id', { id })
      .execute();
    return jobRepository.findById(id);
  },
};
