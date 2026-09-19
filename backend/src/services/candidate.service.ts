import { candidateRepository } from '../repositories/candidate.repository';
import { jobRepository } from '../repositories/job.repository';
import { CandidateStage, GlobalStatus, CandidateStatus } from '../types';
import { GLOBAL_STATUSES, STATUS_OPTIONS_BY_GLOBAL_STATUS } from '../entities/enums';

export const candidateService = {
  // SWFS admin/recruiter view: every candidate across every client.
  getAllCandidates: async () => {
    return candidateRepository.findAll();
  },

  getCandidatesForOrganization: async (organizationId: string) => {
    return candidateRepository.findByOrganization(organizationId);
  },

  // Caller must have already verified job ownership before calling this.
  getCandidatesForJob: async (jobId: string) => {
    return candidateRepository.findByJob(jobId);
  },

  // organizationId === null means "any client" — reserved for SWFS admin/recruiter callers.
  // For a client caller, visibility requires the candidate be linked (via Application)
  // to a job that client posted — same rule as getCandidatesForOrganization's list view.
  getCandidateById: async (candidateId: string, organizationId: string | null) => {
    const candidate = await candidateRepository.findById(candidateId);
    if (!candidate) return null;
    if (organizationId) {
      const linked = await candidateRepository.isLinkedToOrganization(candidateId, organizationId);
      if (!linked) return null;
    }
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
    return candidateRepository.advanceInterviewRound(candidateId, jobId);
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

  submitInterviewFeedback: async (
    candidateId: string,
    jobId: string,
    round: number,
    organizationId: string | null,
    feedback: string,
    rating?: number,
    author?: { email: string; role: string }
  ) => {
    const candidate = await candidateService.getCandidateById(candidateId, organizationId);
    if (!candidate) throw new Error('Candidate not found');

    return candidateRepository.addInterviewFeedback(candidateId, jobId, round, {
      author: author?.email ?? 'unknown',
      authorRole: author?.role,
      comment: feedback,
      rating: rating || undefined,
    });
  },

  // organizationId === null aggregates the pipeline summary across every client.
  getPipelineSummary: async (organizationId: string | null) => {
    return candidateRepository.countByStage(organizationId);
  },

  createCandidate: async (
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
      if (!job) throw new Error('Job not found');
      jobLinks = [{ jobId, jobTitle: job.title, stage: 'APPLIED' }];
      await jobRepository.incrementCandidateCount(jobId);
    }

    return candidateRepository.create({
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

  // `status` is optional: if the caller doesn't pick one for the new
  // globalStatus, the group's default (first option) is used so the
  // candidate never ends up with a status/globalStatus combo that's invalid.
  // Editable candidate detail fields — deliberately excludes globalStatus and
  // status, which have their own dedicated endpoints/flows.
  updateCandidate: async (
    candidateId: string,
    organizationId: string | null,
    data: {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      currentTitle?: string;
      currentCompany?: string;
      location?: string;
      skills?: string[];
      linkedinUrl?: string;
      website?: string;
      notes?: string;
    }
  ) => {
    const candidate = await candidateService.getCandidateById(candidateId, organizationId);
    if (!candidate) throw new Error('Candidate not found');
    if (data.firstName !== undefined && !data.firstName.trim()) {
      throw new Error('firstName cannot be empty');
    }
    if (data.lastName !== undefined && !data.lastName.trim()) {
      throw new Error('lastName cannot be empty');
    }
    return candidateRepository.updateDetails(candidateId, data);
  },

  updateGlobalStatus: async (
    candidateId: string,
    organizationId: string | null,
    globalStatus: string,
    status?: string
  ) => {
    const candidate = await candidateService.getCandidateById(candidateId, organizationId);
    if (!candidate) throw new Error('Candidate not found');
    if (!GLOBAL_STATUSES.includes(globalStatus as GlobalStatus)) {
      throw new Error('Invalid global status');
    }
    const allowedStatuses = STATUS_OPTIONS_BY_GLOBAL_STATUS[globalStatus as GlobalStatus];
    let nextStatus: CandidateStatus;
    if (status) {
      if (!allowedStatuses.includes(status as CandidateStatus)) {
        throw new Error('Invalid status for this global status');
      }
      nextStatus = status as CandidateStatus;
    } else {
      nextStatus = allowedStatuses[0];
    }
    return candidateRepository.updateGlobalStatus(candidateId, globalStatus as GlobalStatus, nextStatus);
  },

  // Changes just the sub-status, independent of globalStatus — must be one
  // of the options for the candidate's *current* globalStatus.
  updateStatus: async (candidateId: string, organizationId: string | null, status: string) => {
    const candidate = await candidateService.getCandidateById(candidateId, organizationId);
    if (!candidate) throw new Error('Candidate not found');
    const allowedStatuses = STATUS_OPTIONS_BY_GLOBAL_STATUS[candidate.globalStatus as GlobalStatus];
    if (!allowedStatuses.includes(status as CandidateStatus)) {
      throw new Error('Invalid status for this candidate’s global status');
    }
    return candidateRepository.updateStatus(candidateId, status as CandidateStatus);
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
