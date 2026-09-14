import { candidateRepository } from '../repositories/candidate.repository';
import { jobRepository } from '../repositories/job.repository';
import { CandidateStage } from '../types';

export const candidateService = {
  // SWFS admin/recruiter view: every candidate across every client.
  getAllCandidates: async () => {
    return candidateRepository.findAll();
  },

  getCandidatesForOrganization: async (organizationId: string) => {
    return candidateRepository.findByOrganization(organizationId);
  },

  // organizationId === null means "any client" — reserved for SWFS admin/recruiter callers.
  getCandidatesForJob: async (jobId: string, organizationId: string | null) => {
    return candidateRepository.findByJob(jobId, organizationId);
  },

  // organizationId === null means "any client" — reserved for SWFS admin/recruiter callers.
  getCandidateById: async (candidateId: string, organizationId: string | null) => {
    const candidate = await candidateRepository.findById(candidateId);
    if (!candidate) return null;
    if (organizationId && candidate.organizationId !== organizationId) return null;
    return candidate;
  },

  shortlistCandidate: async (candidateId: string, jobId: string, organizationId: string | null) => {
    const candidate = await candidateService.getCandidateById(candidateId, organizationId);
    if (!candidate) throw new Error('Candidate not found');
    return candidateRepository.updateStageForJob(candidateId, jobId, 'SHORTLISTED');
  },

  rejectCandidate: async (candidateId: string, jobId: string, organizationId: string | null) => {
    const candidate = await candidateService.getCandidateById(candidateId, organizationId);
    if (!candidate) throw new Error('Candidate not found');
    return candidateRepository.updateStageForJob(candidateId, jobId, 'REJECTED');
  },

  requestInterview: async (candidateId: string, jobId: string, organizationId: string | null, _requestData: any) => {
    const candidate = await candidateService.getCandidateById(candidateId, organizationId);
    if (!candidate) throw new Error('Candidate not found');
    return candidateRepository.updateStageForJob(candidateId, jobId, 'INTERVIEW');
  },

  submitFeedback: async (
    candidateId: string,
    organizationId: string | null,
    feedback: string,
    rating?: number,
    author?: { email: string; role: string }
  ) => {
    const candidate = await candidateService.getCandidateById(candidateId, organizationId);
    if (!candidate) throw new Error('Candidate not found');

    await candidateRepository.addFeedback(candidateId, {
      author: author?.email ?? 'unknown',
      authorRole: author?.role,
      comment: feedback,
      rating: rating || undefined,
    });
    if (rating) await candidateRepository.updateRating(candidateId, rating);

    return candidateRepository.findById(candidateId);
  },

  // organizationId === null aggregates the pipeline summary across every client.
  getPipelineSummary: async (organizationId: string | null) => {
    return candidateRepository.countByStage(organizationId);
  },

  createCandidate: async (
    organizationId: string,
    jobId: string | undefined,
    data: {
      firstName: string;
      lastName: string;
      email?: string;
      phone?: string;
      currentTitle?: string;
      currentCompany?: string;
      location?: string;
      skills?: string[];
      linkedinUrl?: string;
      website?: string;
      source?: 'PORTAL' | 'LINKEDIN';
    }
  ) => {
    let jobLinks: { jobId: string; jobTitle: string; stage: CandidateStage }[] = [];

    if (jobId) {
      const job = await jobRepository.findById(jobId);
      if (!job || job.organizationId !== organizationId) {
        throw new Error('Job not found');
      }
      jobLinks = [{ jobId, jobTitle: job.title, stage: 'APPLIED' }];
      await jobRepository.incrementCandidateCount(jobId);
    }

    return candidateRepository.create(organizationId, {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email ?? '',
      phone: data.phone,
      currentTitle: data.currentTitle,
      currentCompany: data.currentCompany,
      location: data.location,
      jobLinks,
      skills: data.skills || [],
      linkedinUrl: data.linkedinUrl,
      website: data.website,
      source: data.source ?? 'PORTAL',
      rawData: {},
    });
  },

  linkToJob: async (candidateId: string, organizationId: string | null, jobId: string) => {
    const candidate = await candidateService.getCandidateById(candidateId, organizationId);
    if (!candidate) throw new Error('Candidate not found');

    const job = await jobRepository.findById(jobId);
    if (!job || (organizationId && job.organizationId !== organizationId)) throw new Error('Job not found');

    if (candidate.jobLinks.some((l: any) => l.jobId === jobId)) {
      throw new Error('Candidate is already linked to this role');
    }

    await jobRepository.incrementCandidateCount(jobId);
    return candidateRepository.addJobLink(candidateId, jobId, job.title);
  },

  // organizationId === null means "any client" — reserved for SWFS admin/recruiter callers.
  getResumeFile: async (candidateId: string, organizationId: string | null) => {
    const candidate = await candidateService.getCandidateById(candidateId, organizationId);
    if (!candidate) return null;
    return candidateRepository.getResumeFile(candidateId);
  },

  setResume: async (candidateId: string, organizationId: string | null, storedName: string, fileName: string) => {
    const candidate = await candidateService.getCandidateById(candidateId, organizationId);
    if (!candidate) throw new Error('Candidate not found');
    const previous = await candidateRepository.getResumeFile(candidateId);
    const updated = await candidateRepository.setResume(candidateId, storedName, fileName);
    return { candidate: updated, previous };
  },

  deleteResume: async (candidateId: string, organizationId: string | null) => {
    const candidate = await candidateService.getCandidateById(candidateId, organizationId);
    if (!candidate) throw new Error('Candidate not found');
    const previous = await candidateRepository.getResumeFile(candidateId);
    if (!previous) throw new Error('Candidate has no resume');
    const updated = await candidateRepository.clearResume(candidateId);
    return { candidate: updated, previous };
  },
};
