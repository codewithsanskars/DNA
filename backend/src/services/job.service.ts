import { recruitCrmClient } from '../integrations/recruitCrm.client';
import { jobRepository } from '../repositories/job.repository';

export const jobService = {
  getJobsForOrganization: async (organizationId: string) => {
    // Try DB cache first
    const cached = await jobRepository.findByOrganization(organizationId);
    if (cached.length > 0) return cached;

    // Fetch from Recruit CRM and cache
    const crmJobs = await recruitCrmClient.getJobs(organizationId);
    const saved = await Promise.all(
      crmJobs.map((job) =>
        jobRepository.upsert(job.id, organizationId, {
          recruitCrmId: job.id,
          organizationId,
          title: job.title,
          department: job.department,
          location: job.location,
          status: job.status,
          totalCandidates: job.totalCandidates,
          openedAt: job.openedAt ? new Date(job.openedAt) : undefined,
          rawData: job,
        })
      )
    );
    return saved;
  },

  getJobById: async (jobId: string, organizationId: string) => {
    const cached = await jobRepository.findById(jobId);
    if (cached && cached.organizationId === organizationId) return cached;
    return null;
  },

  getPipelineForJob: async (jobId: string, organizationId: string) => {
    const job = await jobService.getJobById(jobId, organizationId);
    if (!job) return null;
    return job;
  },

  createJob: async (
    organizationId: string,
    data: {
      title: string;
      department?: string;
      location?: string;
      status?: string;
      openedAt?: string;
      description?: string;
      payRate?: string;
      billableHours?: string;
      workType?: string;
      payrollType?: string;
    }
  ) => {
    return jobRepository.create(organizationId, {
      title: data.title,
      department: data.department,
      location: data.location,
      status: data.status || 'OPEN',
      openedAt: data.openedAt ? new Date(data.openedAt) : new Date(),
      description: data.description,
      payRate: data.payRate,
      billableHours: data.billableHours,
      workType: data.workType,
      payrollType: data.payrollType,
      rawData: {},
    });
  },
};
