import {
  candidateRepository,
  CandidateSearchParams,
  DuplicateProbe,
} from '../repositories/candidate.repository';
import { jobRepository } from '../repositories/job.repository';
import { workflowRepository } from '../repositories/workflow.repository';
import { Candidate } from '../entities/Candidate';
import { CandidateStage, GlobalStatus, CandidateStatus, RejectionReason } from '../types';
import { GLOBAL_STATUSES, STATUS_OPTIONS_BY_GLOBAL_STATUS } from '../entities/enums';
import { CandidateProfileFields } from '../utils/candidateFields';
import { badRequest, forbidden, notFound } from '../utils/http';

/** Stages a candidate can be submitted from. */
const SUBMITTABLE: CandidateStage[] = ['APPLIED', 'SCREENING'];

/** Stages a CLIENT user may move one of their applications into. */
const CLIENT_STAGES: CandidateStage[] = ['SHORTLISTED', 'INTERVIEW', 'OFFER', 'REJECTED'];

export type BulkAction =
  | { action: 'addTags'; tags: string[] }
  | { action: 'removeTags'; tags: string[] }
  | { action: 'setOwner'; ownerId: string | null }
  | { action: 'setGlobalStatus'; globalStatus: string; status?: string }
  | { action: 'linkJob'; jobId: string }
  | { action: 'delete' };

/** One row of a CSV/Excel import, already mapped to candidate fields by the client. */
export interface ImportRow extends CandidateProfileFields {
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
  noticePeriod?: number | null;
}

export type DuplicateStrategy = 'skip' | 'update' | 'create';

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

  rejectCandidate: async (
    candidateId: string,
    jobId: string,
    organizationId: string | null,
    rejection?: { reason?: RejectionReason | null; note?: string | null }
  ) => {
    const candidate = await candidateService.getCandidateById(candidateId, organizationId);
    if (!candidate) throw new Error('Candidate not found');
    return candidateRepository.updateStageForJob(candidateId, jobId, 'REJECTED', rejection);
  },

  /**
   * Generic stage move — powers the kanban board. Admins may move to any
   * stage; clients only to the decision stages (shortlist, interview, offer,
   * reject). Moving to OFFER runs the same "select" flow as the Select button.
   */
  setStage: async (
    candidateId: string,
    jobId: string,
    organizationId: string | null,
    stage: CandidateStage,
    rejection?: { reason?: RejectionReason | null; note?: string | null }
  ) => {
    if (organizationId && !CLIENT_STAGES.includes(stage)) {
      throw forbidden(`Only SWFS staff can move a candidate to ${stage}`);
    }
    const candidate = await candidateService.getCandidateById(candidateId, organizationId);
    if (!candidate) throw notFound('Candidate not found');
    const application = await candidateRepository.findApplication(candidateId, jobId);
    if (!application || (organizationId && application.job.organization?.id !== organizationId)) {
      throw notFound('Candidate is not linked to this role');
    }
    if (stage === 'OFFER') return candidateService.selectCandidateForJob(candidateId, jobId, organizationId);
    return candidateRepository.updateStageForJob(candidateId, jobId, stage, rejection);
  },

  /**
   * SWFS submits a screened candidate to the client (RC-41). Stamps the
   * submission so "sent → viewed → shortlisted" can be tracked (RC-45).
   * Admin-only (route-enforced). The kanban routes a drop on Submitted here.
   */
  submitToClient: async (candidateId: string, jobId: string, byEmail: string, note: string | null) => {
    const application = await candidateRepository.findApplication(candidateId, jobId);
    if (!application) throw notFound('Candidate is not linked to this role');
    if (!SUBMITTABLE.includes(application.stage) && application.stage !== 'SUBMITTED') {
      throw badRequest(`A ${application.stage.toLowerCase()} candidate can't be submitted — they're past that stage`);
    }
    await candidateRepository.markSubmitted(application.id, byEmail, note);
    return candidateRepository.findById(candidateId);
  },

  /** Records a client's first look at a submitted candidate. Returns true if this view was the first. */
  recordClientView: async (candidateId: string, organizationId: string) =>
    (await candidateRepository.markClientViewed(candidateId, organizationId)) > 0,

  deleteCandidate: async (candidateId: string) => {
    const candidate = await candidateRepository.findById(candidateId);
    if (!candidate) throw notFound('Candidate not found');
    for (const link of candidate.jobLinks) await jobRepository.incrementCandidateCount(link.jobId, -1);
    await candidateRepository.delete(candidateId);
    await workflowRepository.deleteForRecord('candidate', candidateId);
    return candidate;
  },

  search: async (params: CandidateSearchParams) => candidateRepository.search(params),

  /** Paged list for the Candidates / Master database screens, with tab counts. */
  list: async (params: CandidateSearchParams) => {
    const [page, counts] = await Promise.all([
      candidateRepository.search(params),
      candidateRepository.countByGlobalStatus(params),
    ]);
    return { ...page, counts };
  },

  findDuplicates: async (probe: DuplicateProbe, excludeId?: string) => candidateRepository.findDuplicates(probe, excludeId),

  allTags: async () => candidateRepository.allTags(),

  bulk: async (ids: string[], op: BulkAction) => {
    const unique = [...new Set(ids)];
    switch (op.action) {
      case 'addTags':
        await candidateRepository.addTags(unique, op.tags);
        break;
      case 'removeTags':
        await candidateRepository.removeTags(unique, op.tags);
        break;
      case 'setOwner':
        await candidateRepository.setOwner(unique, op.ownerId);
        break;
      case 'setGlobalStatus':
        for (const id of unique) await candidateService.updateGlobalStatus(id, null, op.globalStatus, op.status);
        break;
      case 'linkJob': {
        const job = await jobRepository.findById(op.jobId);
        if (!job) throw notFound('Job not found');
        for (const id of unique) {
          const c = await candidateRepository.findById(id);
          if (!c || c.jobLinks.some((l) => l.jobId === op.jobId)) continue;
          await candidateRepository.addJobLink(id, op.jobId, job.title);
          await jobRepository.incrementCandidateCount(op.jobId);
        }
        break;
      }
      case 'delete':
        for (const id of unique) await candidateService.deleteCandidate(id).catch(() => undefined);
        break;
    }
    return { affected: unique.length };
  },

  /** Duplicate check for every row of a pending import (RC-78). */
  previewImport: async (rows: ImportRow[]) => {
    const out = [];
    for (const [index, row] of rows.entries()) {
      const name = splitName(row);
      const duplicates = await candidateRepository.findDuplicates({
        email: row.email,
        phone: row.phone,
        linkedinUrl: row.linkedinUrl,
        firstName: name.firstName,
        lastName: name.lastName,
      });
      out.push({ index, valid: !!(name.firstName && name.lastName), duplicates });
    }
    return out;
  },

  /**
   * Imports mapped rows (RC-76..RC-78). Each row is checked for duplicates
   * and handled per `strategy`: skip it, merge non-empty values into the
   * existing record, or create it anyway.
   */
  importCandidates: async (rows: ImportRow[], strategy: DuplicateStrategy, jobId?: string) => {
    const job = jobId ? await jobRepository.findById(jobId) : null;
    if (jobId && !job) throw notFound('Job not found');
    const result = { created: 0, updated: 0, skipped: 0, errors: [] as { row: number; error: string }[], ids: [] as string[] };

    for (const [index, raw] of rows.entries()) {
      try {
        const { firstName, lastName } = splitName(raw);
        if (!firstName || !lastName) throw badRequest('First and last name are required');
        const row = { ...raw, firstName, lastName };
        const dupes =
          strategy === 'create'
            ? []
            : await candidateRepository.findDuplicates({
                email: row.email,
                phone: row.phone,
                linkedinUrl: row.linkedinUrl,
                firstName,
                lastName,
              });

        if (dupes.length && strategy === 'skip') {
          result.skipped++;
          continue;
        }
        if (dupes.length && strategy === 'update') {
          const existing = await candidateRepository.findById(dupes[0]._id);
          if (!existing) throw new Error('Duplicate vanished during import');
          const merged: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(row)) {
            if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
            if (k === 'skills' || k === 'tags' || k === 'languages') {
              const prev = ((existing as Record<string, unknown>)[k] as string[]) || [];
              merged[k] = [...new Set([...prev, ...(v as string[])])];
            } else merged[k] = v;
          }
          delete merged.source;
          await candidateRepository.updateDetails(existing._id, merged as Partial<Candidate>);
          if (job && !existing.jobLinks.some((l) => l.jobId === job._id)) {
            await candidateRepository.addJobLink(existing._id, job._id, job.title);
            await jobRepository.incrementCandidateCount(job._id);
          }
          result.updated++;
          result.ids.push(existing._id);
          continue;
        }
        const created = await candidateService.createCandidate(job?._id, {
          ...row,
          source: row.source ?? 'IMPORT',
          currentlyWorking: !!(row.currentTitle || row.currentCompany),
          noticePeriod: row.noticePeriod ?? undefined,
        });
        result.created++;
        if (created) result.ids.push(created._id);
      } catch (err) {
        result.errors.push({ row: index + 1, error: (err as Error).message });
      }
    }
    return result;
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
      noticePeriod?: number;
      ownerId?: string | null;
    } & CandidateProfileFields
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
      yearsExperience: data.yearsExperience,
      education: data.education ?? [],
      certifications: data.certifications ?? [],
      employmentHistory: data.employmentHistory ?? [],
      languages: data.languages ?? [],
      currentCtc: data.currentCtc,
      expectedCtc: data.expectedCtc,
      ctcCurrency: data.ctcCurrency ?? 'USD',
      availableFrom: data.availableFrom,
      workAuthorization: data.workAuthorization,
      tags: data.tags ?? [],
      owner: data.ownerId ? { id: data.ownerId } : null,
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
      ownerId?: string | null;
    } & CandidateProfileFields
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
    const { ownerId, ...fields } = data;
    const updates: Partial<Candidate> = { ...(fields as Partial<Candidate>) };
    if (ownerId !== undefined) updates.owner = ownerId ? ({ id: ownerId } as Candidate['owner']) : null;
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

/** Import rows may carry a single "name" column instead of first/last. */
function splitName(row: ImportRow & { name?: string }): { firstName: string; lastName: string } {
  let firstName = row.firstName?.trim() || '';
  let lastName = row.lastName?.trim() || '';
  if ((!firstName || !lastName) && row.name?.trim()) {
    const parts = row.name.trim().split(/\s+/);
    firstName = firstName || parts[0];
    lastName = lastName || parts.slice(1).join(' ') || '-';
  }
  return { firstName, lastName };
}
