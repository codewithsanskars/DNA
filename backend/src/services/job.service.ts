import { jobRepository } from '../repositories/job.repository';

export const jobService = {
  // SWFS admin/recruiter view: every job across every client.
  getAllJobs: async () => {
    return jobRepository.findAll();
  },

  getJobsForOrganization: async (organizationId: string) => {
    return jobRepository.findByOrganization(organizationId);
  },

  // organizationId === null means "any client" — reserved for SWFS admin/recruiter callers.
  getJobById: async (jobId: string, organizationId: string | null) => {
    const cached = await jobRepository.findById(jobId);
    if (!cached) return null;
    if (organizationId && cached.organizationId !== organizationId) return null;
    return cached;
  },

  getPipelineForJob: async (jobId: string, organizationId: string | null) => {
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
