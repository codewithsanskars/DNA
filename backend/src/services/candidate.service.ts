import { candidateRepository } from '../repositories/candidate.repository';
import { jobRepository } from '../repositories/job.repository';
import { Candidate } from '../entities/Candidate';
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

  // Rolling out an offer for a specific role both advances that role's
  // pipeline stage to OFFER (so the "Selected" view can show which position
  // it was for) and moves the candidate's overall status to SELECTED.
  selectCandidateForJob: async (candidateId: string, jobId: string, organizationId: string | null) => {
    const candidate = await candidateService.getCandidateById(candidateId, organizationId);
    if (!candidate) throw new Error('Candidate not found');
    await candidateRepository.updateStageForJob(candidateId, jobId, 'OFFER');
    return candidateRepository.updateGlobalStatus(candidateId, 'SELECTED', 'SELECTED');
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

  // Only the person who left a piece of feedback can delete it — checked
  // against the DTO's already-scoped feedback list rather than a fresh
  // query, so the same organization/candidate access rules apply.
  deleteFeedback: async (
    candidateId: string,
    organizationId: string | null,
    feedbackId: string,
    requesterEmail: string
  ) => {
    const candidate = await candidateService.getCandidateById(candidateId, organizationId);
    if (!candidate) throw new Error('Candidate not found');
    const entry = (candidate.feedback || []).find((f) => f.id === feedbackId);
    if (!entry) throw new Error('Feedback not found');
    if (entry.author !== requesterEmail) {
      throw Object.assign(new Error('You can only delete your own feedback'), { statusCode: 403 });
    }
    await candidateRepository.deleteFeedback(feedbackId);
    return candidateRepository.findById(candidateId);
  },

  deleteInterviewFeedback: async (
    candidateId: string,
    organizationId: string | null,
    feedbackId: string,
    requesterEmail: string
  ) => {
    const candidate = await candidateService.getCandidateById(candidateId, organizationId);
    if (!candidate) throw new Error('Candidate not found');
    const entry = (candidate.jobLinks || [])
      .flatMap((link) => link.interviewFeedback || [])
      .find((f) => f.id === feedbackId);
    if (!entry) throw new Error('Feedback not found');
    if (entry.author !== requesterEmail) {
      throw Object.assign(new Error('You can only delete your own feedback'), { statusCode: 403 });
    }
    await candidateRepository.deleteInterviewFeedback(feedbackId);
    return candidateRepository.findById(candidateId);
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
      currentlyWorking?: boolean;
      currentTitle?: string;
      currentCompany?: string;
      location?: string;
      skills?: string[];
      linkedinUrl?: string;
      website?: string;
      notes?: string;
      source?: 'PORTAL' | 'LINKEDIN';
      noticePeriod?: number;
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
      currentlyWorking: data.currentlyWorking,
      currentTitle: data.currentlyWorking ? data.currentTitle : undefined,
      currentCompany: data.currentlyWorking ? data.currentCompany : undefined,
      location: data.location,
      jobLinks,
      skills: data.skills || [],
      linkedinUrl: data.linkedinUrl,
      website: data.website,
      notes: data.notes,
      source: data.source ?? 'PORTAL',
      noticePeriod: data.noticePeriod,
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
      currentlyWorking?: boolean;
      currentTitle?: string;
      currentCompany?: string;
      location?: string;
      skills?: string[];
      linkedinUrl?: string;
      website?: string;
      notes?: string;
      noticePeriod?: number;
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
    if (data.noticePeriod !== undefined && data.noticePeriod !== null) {
      if (!Number.isInteger(data.noticePeriod) || data.noticePeriod < 0) {
        throw new Error('noticePeriod must be a whole number of days, 0 or more');
      }
    }
    // Not currently working means designation/company no longer apply —
    // clear them (an `undefined` value here is skipped by the update, not
    // written as NULL, so it has to be explicit).
    const updates: Partial<Candidate> = { ...data };
    if (data.currentlyWorking === false) {
      updates.currentTitle = null as unknown as undefined;
      updates.currentCompany = null as unknown as undefined;
    }
    return candidateRepository.updateDetails(candidateId, updates);
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

  // Same trio of operations as the resume, for the candidate's photo.
  getPhotoFile: async (candidateId: string, organizationId: string | null) => {
    const candidate = await candidateService.getCandidateById(candidateId, organizationId);
    if (!candidate) return null;
    return candidateRepository.getPhotoFile(candidateId);
  },

  setPhoto: async (candidateId: string, organizationId: string | null, storedName: string, fileName: string) => {
    const candidate = await candidateService.getCandidateById(candidateId, organizationId);
    if (!candidate) throw new Error('Candidate not found');
    const previous = await candidateRepository.getPhotoFile(candidateId);
    const updated = await candidateRepository.setPhoto(candidateId, storedName, fileName);
    return { candidate: updated, previous };
  },

  deletePhoto: async (candidateId: string, organizationId: string | null) => {
    const candidate = await candidateService.getCandidateById(candidateId, organizationId);
    if (!candidate) throw new Error('Candidate not found');
    const previous = await candidateRepository.getPhotoFile(candidateId);
    if (!previous) throw new Error('Candidate has no photo');
    const updated = await candidateRepository.clearPhoto(candidateId);
    return { candidate: updated, previous };
  },
};
