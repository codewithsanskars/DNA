import { recruitCrmClient } from '../integrations/recruitCrm.client';
import { candidateRepository } from '../repositories/candidate.repository';
import { jobRepository } from '../repositories/job.repository';
import { CandidateStage } from '../types';

export const candidateService = {
  getCandidatesForJob: async (jobId: string, organizationId: string) => {
    const cached = await candidateRepository.findByJob(jobId, organizationId);
    if (cached.length > 0) return cached;

    const crmCandidates = await recruitCrmClient.getCandidatesForJob(jobId);
    const saved = await Promise.all(
      crmCandidates.map((c) =>
        candidateRepository.upsert(c.id, organizationId, {
          recruitCrmId: c.id,
          organizationId,
          jobId,
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          phone: c.phone,
          currentTitle: c.currentTitle,
          currentCompany: c.currentCompany,
          location: c.location,
          stage: c.stage as CandidateStage,
          skills: c.skills || [],
          linkedinUrl: c.linkedinUrl,
          rawData: c,
        })
      )
    );
    return saved;
  },

  getCandidateById: async (candidateId: string, organizationId: string) => {
    const candidate = await candidateRepository.findById(candidateId);
    if (!candidate || candidate.organizationId !== organizationId) return null;
    return candidate;
  },

  shortlistCandidate: async (candidateId: string, organizationId: string) => {
    const candidate = await candidateService.getCandidateById(candidateId, organizationId);
    if (!candidate) throw new Error('Candidate not found');

    await recruitCrmClient.updateCandidateStage(candidate.recruitCrmId, 'SHORTLISTED');
    return candidateRepository.updateStage(candidateId, 'SHORTLISTED');
  },

  rejectCandidate: async (candidateId: string, organizationId: string) => {
    const candidate = await candidateService.getCandidateById(candidateId, organizationId);
    if (!candidate) throw new Error('Candidate not found');

    await recruitCrmClient.updateCandidateStage(candidate.recruitCrmId, 'REJECTED');
    return candidateRepository.updateStage(candidateId, 'REJECTED');
  },

  requestInterview: async (candidateId: string, organizationId: string, requestData: any) => {
    const candidate = await candidateService.getCandidateById(candidateId, organizationId);
    if (!candidate) throw new Error('Candidate not found');

    await recruitCrmClient.requestInterview(candidate.recruitCrmId, requestData);
    return candidateRepository.updateStage(candidateId, 'INTERVIEW');
  },

  submitFeedback: async (
    candidateId: string,
    organizationId: string,
    feedback: string,
    rating?: number
  ) => {
    const candidate = await candidateService.getCandidateById(candidateId, organizationId);
    if (!candidate) throw new Error('Candidate not found');

    await recruitCrmClient.submitFeedback(candidate.recruitCrmId, feedback, rating);
    if (rating) await candidateRepository.updateRating(candidateId, rating);
    return { success: true };
  },

  getPipelineSummary: async (organizationId: string) => {
    return candidateRepository.countByStage(organizationId);
  },

  createCandidate: async (
    organizationId: string,
    jobId: string,
    data: {
      firstName: string;
      lastName: string;
      email: string;
      phone?: string;
      currentTitle?: string;
      currentCompany?: string;
      location?: string;
      skills?: string[];
      linkedinUrl?: string;
    }
  ) => {
    const job = await jobRepository.findById(jobId);
    if (!job || job.organizationId !== organizationId) {
      throw new Error('Job not found');
    }

    const candidate = await candidateRepository.create(organizationId, jobId, {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      currentTitle: data.currentTitle,
      currentCompany: data.currentCompany,
      location: data.location,
      skills: data.skills || [],
      linkedinUrl: data.linkedinUrl,
      rawData: {},
    });
    job.totalCandidates = (job.totalCandidates || 0) + 1;
    return candidate;
  },
};
