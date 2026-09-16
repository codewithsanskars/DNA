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
      payRate?: number;
      billRate?: number;
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
      billRate: data.billRate,
      billableHours: data.billableHours,
      workType: data.workType,
      payrollType: data.payrollType,
      rawData: {},
    });
  },

  // organizationId === null means "any client" — reserved for SWFS admin/recruiter callers.
  updateJob: async (
    jobId: string,
    organizationId: string | null,
    data: {
      title?: string;
      department?: string;
      location?: string;
      status?: string;
      description?: string;
      payRate?: number;
      billRate?: number;
      billableHours?: string;
      workType?: string;
      payrollType?: string;
    }
  ) => {
    const job = await jobService.getJobById(jobId, organizationId);
    if (!job) throw new Error('Job not found');
    return jobRepository.update(jobId, data);
  },

  // organizationId === null means "any client" — reserved for SWFS admin/recruiter callers.
  getDescriptionFile: async (jobId: string, organizationId: string | null) => {
    const job = await jobService.getJobById(jobId, organizationId);
    if (!job) return null;
    return jobRepository.getDescriptionFile(jobId);
  },

  setDescriptionFile: async (jobId: string, organizationId: string | null, storedName: string, fileName: string) => {
    const job = await jobService.getJobById(jobId, organizationId);
    if (!job) throw new Error('Job not found');
    const previous = await jobRepository.getDescriptionFile(jobId);
    const updated = await jobRepository.setDescriptionFile(jobId, storedName, fileName);
    return { job: updated, previous };
  },

  deleteDescriptionFile: async (jobId: string, organizationId: string | null) => {
    const job = await jobService.getJobById(jobId, organizationId);
    if (!job) throw new Error('Job not found');
    const previous = await jobRepository.getDescriptionFile(jobId);
    if (!previous) throw new Error('Job has no description on file');
    const updated = await jobRepository.clearDescriptionFile(jobId);
    return { job: updated, previous };
  },
};
