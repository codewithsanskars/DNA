import { mockJobs } from '../data/mockStore';

export const jobRepository = {
  findByOrganization: async (organizationId: string) =>
    mockJobs.filter((j) => j.organizationId === organizationId),

  findById: async (id: string) =>
    mockJobs.find((j) => j._id === id || j.id === id) || null,

  findByRecruitCrmId: async (recruitCrmId: string, organizationId: string) =>
    mockJobs.find((j) => j.recruitCrmId === recruitCrmId && j.organizationId === organizationId) || null,

  upsert: async (recruitCrmId: string, organizationId: string, data: any) => {
    const existing = mockJobs.find(
      (j) => j.recruitCrmId === recruitCrmId && j.organizationId === organizationId
    );
    if (existing) return Object.assign(existing, data);
    const job = { ...data, _id: recruitCrmId, id: recruitCrmId };
    mockJobs.push(job as any);
    return job;
  },

  create: async (organizationId: string, data: any) => {
    const id = `job_${Date.now()}`;
    const job = {
      _id: id,
      id,
      recruitCrmId: id,
      organizationId,
      totalCandidates: 0,
      status: 'OPEN',
      syncedAt: new Date(),
      ...data,
    };
    mockJobs.push(job as any);
    return job;
  },

  countByOrganization: async (organizationId: string) =>
    mockJobs.filter((j) => j.organizationId === organizationId && j.status === 'OPEN').length,
};
