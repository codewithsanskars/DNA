import { mockCandidates } from '../data/mockStore';
import { CandidateStage } from '../types';

export const candidateRepository = {
  findByOrganization: async (organizationId: string) =>
    mockCandidates.filter((c) => c.organizationId === organizationId),

  findByJob: async (jobId: string, organizationId: string) =>
    mockCandidates.filter((c) => c.jobId === jobId && c.organizationId === organizationId),

  findById: async (id: string) =>
    mockCandidates.find((c) => c._id === id || c.id === id) || null,

  findByRecruitCrmId: async (recruitCrmId: string, organizationId: string) =>
    mockCandidates.find((c) => c.recruitCrmId === recruitCrmId && c.organizationId === organizationId) || null,

  upsert: async (recruitCrmId: string, organizationId: string, data: any) => {
    const existing = mockCandidates.find(
      (c) => c.recruitCrmId === recruitCrmId && c.organizationId === organizationId
    );
    if (existing) return Object.assign(existing, data);
    const candidate = { ...data, _id: recruitCrmId, id: recruitCrmId };
    mockCandidates.push(candidate as any);
    return candidate;
  },

  create: async (organizationId: string, jobId: string, data: any) => {
    const id = `cand_${Date.now()}`;
    const candidate = {
      _id: id,
      id,
      recruitCrmId: id,
      organizationId,
      jobId,
      stage: 'APPLIED',
      skills: [],
      clientRating: null,
      syncedAt: new Date(),
      ...data,
    };
    mockCandidates.push(candidate as any);
    return candidate;
  },

  updateStage: async (id: string, stage: CandidateStage) => {
    const candidate = mockCandidates.find((c) => c._id === id || c.id === id);
    if (candidate) candidate.stage = stage;
    return candidate || null;
  },

  updateRating: async (id: string, clientRating: number) => {
    const candidate = mockCandidates.find((c) => c._id === id || c.id === id);
    if (candidate) (candidate as any).clientRating = clientRating;
    return candidate || null;
  },

  countByStage: async (organizationId: string) => {
    const stages: CandidateStage[] = ['APPLIED', 'SCREENING', 'INTERVIEW', 'SHORTLISTED', 'OFFER', 'HIRED', 'REJECTED'];
    const counts: Record<string, number> = {};
    for (const stage of stages) {
      counts[stage] = mockCandidates.filter(
        (c) => c.organizationId === organizationId && c.stage === stage
      ).length;
    }
    return counts;
  },
};
