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
    payRate: job.payRate,
    billableHours: job.billableHours,
    workType: job.workType,
    payrollType: job.payrollType,
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
};
