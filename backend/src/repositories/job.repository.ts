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
  };
}

export const jobRepository = {
  findAll: async () => {
    const jobs = await repo().find({ relations: ['organization'], order: { createdAt: 'DESC' } });
    return jobs.map(toDto);
  },

  findByOrganization: async (organizationId: string) => {
    const jobs = await repo().find({
      where: { organization: { id: organizationId } },
      relations: ['organization'],
      order: { createdAt: 'DESC' },
    });
    return jobs.map(toDto);
  },

  findById: async (id: string) => {
    const job = await repo().findOne({ where: { id }, relations: ['organization'] });
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
    await repo().update(id, data);
    return jobRepository.findById(id);
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
