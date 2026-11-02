import path from 'path';
import fs from 'fs';
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { candidateService } from '../services/candidate.service';
import { matchService } from '../services/match.service';
import { pdfService } from '../services/pdf.service';
import { auditLogService } from '../services/auditLog.service';
import { isAdminRole } from '../utils/roles';
import { RESUME_DIR, CANDIDATE_PHOTO_DIR } from '../middleware/upload.middleware';
import { parseProfileFields } from '../utils/candidateFields';
import {
  optionalEnum,
  optionalNumber,
  optionalString,
  optionalStringArray,
  optionalUuid,
  orgScopeOf,
  badRequest as httpBadRequest,
} from '../utils/http';
import { CANDIDATE_STAGES, GLOBAL_STATUSES, REJECTION_REASONS } from '../entities/enums';
import { BulkAction, DuplicateStrategy, ImportRow } from '../services/candidate.service';
import { CandidateSearchParams } from '../repositories/candidate.repository';

const MAX_IMPORT_ROWS = 5000;

// Query-string list: `?skills=react,node` or repeated `?skills=a&skills=b`.
function listParam(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  const raw = Array.isArray(value) ? value.join(',') : String(value);
  const list = raw.split(',').map((v) => v.trim()).filter(Boolean);
  return list.length ? list : undefined;
}

function parseRejection(body: Record<string, unknown>) {
  return {
    reason: optionalEnum(body.rejectionReason, REJECTION_REASONS, 'Rejection reason') ?? null,
    note: optionalString(body.rejectionNote, 'Rejection note', 2000) || null,
  };
}

function badRequest(message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode: 400 });
}

// Same pattern the browser's own `type="email"` validation uses (the
// WHATWG HTML spec's email regex) — the frontend enforces this too, but a
// request can always bypass that, so it's re-checked here.
const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

function assertValidEmail(value: unknown): void {
  if (value === undefined || value === null || value === '') return;
  if (!EMAIL_RE.test(String(value).trim())) {
    throw badRequest('Email must be a valid email address');
  }
}

// Accepts both a real boolean (JSON body) and the string a plain form field
// would send ("true"/"false"), so either kind of caller works.
function parseBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw badRequest('currentlyWorking must be true or false');
}

// Notice period is always whole days — anything else (fractional, negative,
// non-numeric) would otherwise reach the `int` column and either fail
// silently (truncated) or throw an opaque 500.
function parseNoticePeriod(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0) {
    throw badRequest('Notice period must be a whole number of days, 0 or more');
  }
  return num;
}

// A rating is optional (a plain comment has none), but when given it must be
// a real star pick — 1 through 5, never 0 or negative.
function assertValidRating(value: unknown): void {
  if (value === undefined || value === null || value === '') return;
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1 || num > 5) {
    throw badRequest('Rating must be between 1 and 5');
  }
}

export const candidateController = {
  getCandidates: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = isAdminRole(req.user!.role)
        ? await candidateService.getAllCandidates()
        : await candidateService.getCandidatesForOrganization(req.user!.organizationId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  getCandidate: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const orgScope = isAdminRole(req.user!.role) ? null : req.user!.organizationId;
      let candidate = await candidateService.getCandidateById(req.params.id, orgScope);
      if (!candidate) {
        res.status(404).json({ success: false, error: 'Candidate not found' });
        return;
      }
      // A client opening a submitted candidate is the "viewed" signal (RC-45).
      if (orgScope && (await candidateService.recordClientView(req.params.id, orgScope))) {
        await auditLogService.log(req.user!, 'CLIENT_VIEWED_SUBMISSION', 'candidate', req.params.id, {});
        candidate = (await candidateService.getCandidateById(req.params.id, orgScope)) ?? candidate;
      }
      res.json({ success: true, data: candidate });
    } catch (err) {
      next(err);
    }
  },

  updateCandidate: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const {
        firstName,
        lastName,
        email,
        phone,
        currentlyWorking,
        currentTitle,
        currentCompany,
        location,
        skills,
        linkedinUrl,
        website,
        notes,
        noticePeriod,
      } = req.body;
      assertValidEmail(email);
      const orgScope = isAdminRole(req.user!.role) ? null : req.user!.organizationId;
      const updated = await candidateService.updateCandidate(req.params.id, orgScope, {
        firstName,
        lastName,
        email,
        phone,
        currentlyWorking: parseBoolean(currentlyWorking),
        currentTitle,
        currentCompany,
        location,
        skills,
        linkedinUrl,
        website,
        notes,
        noticePeriod: parseNoticePeriod(noticePeriod),
        ownerId: optionalUuid(req.body.ownerId, 'Owner'),
        ...parseProfileFields(req.body),
      });
      await auditLogService.log(req.user!, 'UPDATE_CANDIDATE', 'candidate', req.params.id, req.body);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },

  shortlist: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { jobId } = req.body;
      if (!jobId) {
        res.status(400).json({ success: false, error: 'jobId is required' });
        return;
      }
      const orgScope = isAdminRole(req.user!.role) ? null : req.user!.organizationId;
      const updated = await candidateService.shortlistCandidate(req.params.id, jobId, orgScope);
      await auditLogService.log(req.user!, 'SHORTLIST', 'candidate', req.params.id, { jobId });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },

  reject: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { jobId } = req.body;
      if (!jobId) {
        res.status(400).json({ success: false, error: 'jobId is required' });
        return;
      }
      const orgScope = isAdminRole(req.user!.role) ? null : req.user!.organizationId;
      const rejection = parseRejection(req.body);
      const updated = await candidateService.rejectCandidate(req.params.id, jobId, orgScope, rejection);
      await auditLogService.log(req.user!, 'REJECT', 'candidate', req.params.id, { jobId, ...rejection });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },

  selectCandidate: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { jobId } = req.body;
      if (!jobId) {
        res.status(400).json({ success: false, error: 'jobId is required' });
        return;
      }
      const orgScope = isAdminRole(req.user!.role) ? null : req.user!.organizationId;
      const updated = await candidateService.selectCandidateForJob(req.params.id, jobId, orgScope);
      await auditLogService.log(req.user!, 'SELECT_CANDIDATE', 'candidate', req.params.id, { jobId });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },

  requestInterview: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { jobId, ...requestData } = req.body;
      if (!jobId) {
        res.status(400).json({ success: false, error: 'jobId is required' });
        return;
      }
      const orgScope = isAdminRole(req.user!.role) ? null : req.user!.organizationId;
      const updated = await candidateService.requestInterview(req.params.id, jobId, orgScope, requestData);
      await auditLogService.log(req.user!, 'REQUEST_INTERVIEW', 'candidate', req.params.id, req.body);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },

  submitInterviewFeedback: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { jobId, round, feedback, rating } = req.body;
      if (!jobId) {
        res.status(400).json({ success: false, error: 'jobId is required' });
        return;
      }
      if (!Number.isInteger(round) || round < 1 || round > 3) {
        res.status(400).json({ success: false, error: 'round must be 1, 2, or 3' });
        return;
      }
      if (!feedback || !String(feedback).trim()) {
        res.status(400).json({ success: false, error: 'feedback is required' });
        return;
      }
      assertValidRating(rating);
      const orgScope = isAdminRole(req.user!.role) ? null : req.user!.organizationId;
      const result = await candidateService.submitInterviewFeedback(
        req.params.id,
        jobId,
        round,
        orgScope,
        String(feedback).trim(),
        rating,
        { email: req.user!.email, role: req.user!.role }
      );
      await auditLogService.log(req.user!, 'SUBMIT_INTERVIEW_FEEDBACK', 'candidate', req.params.id, {
        jobId,
        round,
        feedback,
        rating,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  submitFeedback: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { feedback, rating } = req.body;
      if (!feedback || !String(feedback).trim()) {
        res.status(400).json({ success: false, error: 'feedback is required' });
        return;
      }
      assertValidRating(rating);
      const orgScope = isAdminRole(req.user!.role) ? null : req.user!.organizationId;
      const result = await candidateService.submitFeedback(
        req.params.id,
        orgScope,
        String(feedback).trim(),
        rating,
        { email: req.user!.email, role: req.user!.role }
      );
      await auditLogService.log(req.user!, 'SUBMIT_FEEDBACK', 'candidate', req.params.id, { feedback, rating });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  deleteFeedback: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const orgScope = isAdminRole(req.user!.role) ? null : req.user!.organizationId;
      const result = await candidateService.deleteFeedback(
        req.params.id,
        orgScope,
        req.params.feedbackId,
        req.user!.email
      );
      await auditLogService.log(req.user!, 'DELETE_FEEDBACK', 'candidate', req.params.id, {
        feedbackId: req.params.feedbackId,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  deleteInterviewFeedback: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const orgScope = isAdminRole(req.user!.role) ? null : req.user!.organizationId;
      const result = await candidateService.deleteInterviewFeedback(
        req.params.id,
        orgScope,
        req.params.feedbackId,
        req.user!.email
      );
      await auditLogService.log(req.user!, 'DELETE_INTERVIEW_FEEDBACK', 'candidate', req.params.id, {
        feedbackId: req.params.feedbackId,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  createCandidate: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { jobId, firstName, lastName, email, phone, currentlyWorking, currentTitle, currentCompany, location, skills, linkedinUrl, website, notes, noticePeriod } = req.body;
      if (!firstName || !lastName) {
        res.status(400).json({ success: false, error: 'firstName and lastName are required' });
        return;
      }
      assertValidEmail(email);
      const profile = parseProfileFields(req.body);
      const candidateSource = profile.source ?? 'PORTAL';

      const candidate = await candidateService.createCandidate(jobId || undefined, {
        firstName,
        lastName,
        email,
        phone,
        currentlyWorking: parseBoolean(currentlyWorking),
        currentTitle,
        currentCompany,
        location,
        skills,
        linkedinUrl,
        website,
        notes,
        ...profile,
        source: candidateSource,
        noticePeriod: parseNoticePeriod(noticePeriod),
        // New candidates default to the recruiter who created them.
        ownerId: optionalUuid(req.body.ownerId, 'Owner') ?? req.user!.userId,
      });
      await auditLogService.log(req.user!, 'CREATE_CANDIDATE', 'candidate', candidate._id, { jobId, email, source: candidateSource });
      res.status(201).json({ success: true, data: candidate });
    } catch (err) {
      next(err);
    }
  },

  updateGlobalStatus: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { globalStatus, status } = req.body;
      if (!globalStatus) {
        res.status(400).json({ success: false, error: 'globalStatus is required' });
        return;
      }
      const orgScope = isAdminRole(req.user!.role) ? null : req.user!.organizationId;
      const updated = await candidateService.updateGlobalStatus(req.params.id, orgScope, globalStatus, status);
      await auditLogService.log(req.user!, 'UPDATE_GLOBAL_STATUS', 'candidate', req.params.id, {
        globalStatus,
        status,
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },

  updateStatus: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { status } = req.body;
      if (!status) {
        res.status(400).json({ success: false, error: 'status is required' });
        return;
      }
      const orgScope = isAdminRole(req.user!.role) ? null : req.user!.organizationId;
      const updated = await candidateService.updateStatus(req.params.id, orgScope, status);
      await auditLogService.log(req.user!, 'UPDATE_STATUS', 'candidate', req.params.id, { status });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },

  linkJob: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { jobId } = req.body;
      if (!jobId) {
        res.status(400).json({ success: false, error: 'jobId is required' });
        return;
      }
      const orgScope = isAdminRole(req.user!.role) ? null : req.user!.organizationId;
      const updated = await candidateService.linkToJob(req.params.id, orgScope, jobId);
      await auditLogService.log(req.user!, 'LINK_JOB', 'candidate', req.params.id, { jobId });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },

  uploadResume: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: 'A .pdf or .docx resume file is required' });
        return;
      }
      const orgScope = isAdminRole(req.user!.role) ? null : req.user!.organizationId;
      const { candidate, previous } = await candidateService.setResume(
        req.params.id,
        orgScope,
        req.file.filename,
        req.file.originalname
      );
      if (previous) fs.unlink(path.join(RESUME_DIR, previous.storedName), () => {});
      await auditLogService.log(req.user!, 'UPLOAD_RESUME', 'candidate', req.params.id, {
        fileName: req.file.originalname,
      });
      res.json({ success: true, data: candidate });
    } catch (err) {
      if (req.file) fs.unlink(req.file.path, () => {});
      next(err);
    }
  },

  downloadResume: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const orgScope = isAdminRole(req.user!.role) ? null : req.user!.organizationId;
      const file = await candidateService.getResumeFile(req.params.id, orgScope);
      if (!file) {
        res.status(404).json({ success: false, error: 'Resume not found' });
        return;
      }
      const filePath = path.join(RESUME_DIR, file.storedName);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ success: false, error: 'Resume file is missing' });
        return;
      }
      res.download(filePath, file.fileName || file.storedName);
    } catch (err) {
      next(err);
    }
  },

  deleteResume: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const orgScope = isAdminRole(req.user!.role) ? null : req.user!.organizationId;
      const { candidate, previous } = await candidateService.deleteResume(req.params.id, orgScope);
      if (previous) fs.unlink(path.join(RESUME_DIR, previous.storedName), () => {});
      await auditLogService.log(req.user!, 'DELETE_RESUME', 'candidate', req.params.id, {});
      res.json({ success: true, data: candidate });
    } catch (err) {
      next(err);
    }
  },

  uploadPhoto: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: 'A .jpg or .jpeg photo file is required' });
        return;
      }
      const orgScope = isAdminRole(req.user!.role) ? null : req.user!.organizationId;
      const { candidate, previous } = await candidateService.setPhoto(
        req.params.id,
        orgScope,
        req.file.filename,
        req.file.originalname
      );
      if (previous) fs.unlink(path.join(CANDIDATE_PHOTO_DIR, previous.storedName), () => {});
      await auditLogService.log(req.user!, 'UPLOAD_CANDIDATE_PHOTO', 'candidate', req.params.id, {
        fileName: req.file.originalname,
      });
      res.json({ success: true, data: candidate });
    } catch (err) {
      if (req.file) fs.unlink(req.file.path, () => {});
      next(err);
    }
  },

  // Served inline (not as an attachment) so it can be used directly as an
  // <img src> — unlike the resume, which is meant to be downloaded/viewed as a document.
  getPhoto: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const orgScope = isAdminRole(req.user!.role) ? null : req.user!.organizationId;
      const file = await candidateService.getPhotoFile(req.params.id, orgScope);
      if (!file) {
        res.status(404).json({ success: false, error: 'Photo not found' });
        return;
      }
      const filePath = path.join(CANDIDATE_PHOTO_DIR, file.storedName);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ success: false, error: 'Photo file is missing' });
        return;
      }
      res.sendFile(filePath);
    } catch (err) {
      next(err);
    }
  },

  deletePhoto: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const orgScope = isAdminRole(req.user!.role) ? null : req.user!.organizationId;
      const { candidate, previous } = await candidateService.deletePhoto(req.params.id, orgScope);
      if (previous) fs.unlink(path.join(CANDIDATE_PHOTO_DIR, previous.storedName), () => {});
      await auditLogService.log(req.user!, 'DELETE_CANDIDATE_PHOTO', 'candidate', req.params.id, {});
      res.json({ success: true, data: candidate });
    } catch (err) {
      next(err);
    }
  },

  // ---- Recruiter workflow (admin unless noted) -------------------------------

  /** Kanban stage move — CLIENT allowed for decision stages only (service enforces). */
  setStage: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const jobId = optionalUuid(req.body.jobId, 'jobId');
      const stage = optionalEnum(req.body.stage, CANDIDATE_STAGES, 'Stage');
      if (!jobId || !stage) throw httpBadRequest('jobId and stage are required');
      const rejection = parseRejection(req.body);
      if (stage === 'SUBMITTED') {
        // Same as the explicit submit action — never a client move.
        if (orgScopeOf(req)) throw httpBadRequest('Only SWFS can submit candidates');
        const submitted = await candidateService.submitToClient(req.params.id, jobId, req.user!.email, null);
        await auditLogService.log(req.user!, 'SUBMIT_TO_CLIENT', 'candidate', req.params.id, { jobId });
        res.json({ success: true, data: submitted });
        return;
      }
      const updated = await candidateService.setStage(req.params.id, jobId, orgScopeOf(req), stage, rejection);
      await auditLogService.log(req.user!, 'CHANGE_STAGE', 'candidate', req.params.id, {
        jobId,
        stage,
        ...(stage === 'REJECTED' ? rejection : {}),
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },

  deleteCandidate: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const removed = await candidateService.deleteCandidate(req.params.id);
      await auditLogService.log(req.user!, 'DELETE_CANDIDATE', 'candidate', req.params.id, {
        name: `${removed.firstName} ${removed.lastName}`,
      });
      res.json({ success: true, data: { id: req.params.id } });
    } catch (err) {
      next(err);
    }
  },

  /** GET /candidates/:id/pdf?variant=client|internal&jobId= — downloadable profile. */
  downloadPdf: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const variant = req.query.variant === 'internal' ? 'internal' : 'client';
      const jobId = optionalUuid(req.query.jobId, 'Role') ?? undefined;
      const { buffer, fileName } = await pdfService.candidateProfile(req.params.id, orgScopeOf(req), { variant, jobId });
      await auditLogService.log(req.user!, 'EXPORT_CANDIDATE_PDF', 'candidate', req.params.id, { variant, jobId });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  },

  search: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const q = req.query;
      const owner = typeof q.owner === 'string' ? q.owner : undefined;
      const params: CandidateSearchParams = {
        q: optionalString(q.q, 'Query', 500) || undefined,
        skills: listParam(q.skills),
        title: optionalString(q.title, 'Title', 200) || undefined,
        company: optionalString(q.company, 'Company', 200) || undefined,
        location: optionalString(q.location, 'Location', 200) || undefined,
        education: optionalString(q.education, 'Education', 200) || undefined,
        minExperience: optionalNumber(q.minExperience, 'Min experience', { min: 0 }) ?? undefined,
        maxExperience: optionalNumber(q.maxExperience, 'Max experience', { min: 0 }) ?? undefined,
        maxExpectedCtc: optionalNumber(q.maxExpectedCtc, 'Max expected CTC', { min: 0 }) ?? undefined,
        maxNoticePeriod: optionalNumber(q.maxNoticePeriod, 'Max notice period', { min: 0 }) ?? undefined,
        availableBy: typeof q.availableBy === 'string' && q.availableBy ? q.availableBy : undefined,
        workAuthorization: listParam(q.workAuthorization),
        globalStatus: listParam(q.globalStatus)?.filter((s) => GLOBAL_STATUSES.includes(s as never)),
        source: listParam(q.source),
        tags: listParam(q.tags),
        ownerId: owner === 'me' ? req.user!.userId : owner === 'none' ? 'none' : optionalUuid(owner, 'Owner') ?? undefined,
        jobId: optionalUuid(q.jobId, 'jobId') ?? undefined,
        stage: listParam(q.stage)?.filter((s) => CANDIDATE_STAGES.includes(s as never)),
        page: optionalNumber(q.page, 'Page', { min: 1, integer: true }) ?? undefined,
        pageSize: optionalNumber(q.pageSize, 'Page size', { min: 1, max: 200, integer: true }) ?? undefined,
        sort: typeof q.sort === 'string' ? q.sort : undefined,
      };
      // "Match to role" filter: rank by JD match % instead of the normal sort.
      const matchJobId = optionalUuid(q.matchJobId, 'Match role') ?? undefined;
      const minMatch = optionalNumber(q.minMatch, 'Minimum match', { min: 0, max: 100 }) ?? 0;
      const data = matchJobId
        ? await matchService.searchWithMatch(params, matchJobId, minMatch)
        : await candidateService.search(params);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Paged candidate list for both roles. A client is always scoped to
   * candidates on their own roles and searches only client-visible fields;
   * internal fields are stripped by the redact middleware.
   */
  list: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const q = req.query;
      const orgScope = orgScopeOf(req);
      const data = await candidateService.list({
        q: optionalString(q.q, 'Query', 500) || undefined,
        globalStatus: listParam(q.globalStatus)?.filter((s) => GLOBAL_STATUSES.includes(s as never)),
        jobId: optionalUuid(q.jobId, 'jobId') ?? undefined,
        stage: listParam(q.stage)?.filter((s) => CANDIDATE_STAGES.includes(s as never)),
        source: orgScope ? undefined : listParam(q.source),
        masterPool: !orgScope && q.masterPool === 'true',
        organizationId: orgScope ?? undefined,
        clientSafe: !!orgScope,
        page: optionalNumber(q.page, 'Page', { min: 1, integer: true }) ?? 1,
        pageSize: optionalNumber(q.pageSize, 'Page size', { min: 1, max: 200, integer: true }) ?? 25,
        sort: ['recent', 'updated', 'name'].includes(String(q.sort)) ? String(q.sort) : 'recent',
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  findDuplicates: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const q = req.query as Record<string, string | undefined>;
      const data = await candidateService.findDuplicates(
        { email: q.email, phone: q.phone, linkedinUrl: q.linkedinUrl, firstName: q.firstName, lastName: q.lastName },
        q.excludeId
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  getTags: async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      res.json({ success: true, data: await candidateService.allTags() });
    } catch (err) {
      next(err);
    }
  },

  bulk: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const ids = optionalStringArray(req.body.ids, 'ids', 1000) ?? [];
      if (!ids.length) throw httpBadRequest('Select at least one candidate');
      ids.forEach((id) => optionalUuid(id, 'Candidate id'));
      const action = String(req.body.action || '');
      let op: BulkAction;
      switch (action) {
        case 'addTags':
        case 'removeTags': {
          const tags = optionalStringArray(req.body.tags, 'Tags', 50) ?? [];
          if (!tags.length) throw httpBadRequest('Provide at least one tag');
          op = { action, tags };
          break;
        }
        case 'setOwner':
          op = { action, ownerId: optionalUuid(req.body.ownerId, 'Owner') ?? null };
          break;
        case 'setGlobalStatus':
          if (!req.body.globalStatus) throw httpBadRequest('globalStatus is required');
          op = { action, globalStatus: req.body.globalStatus, status: req.body.status || undefined };
          break;
        case 'linkJob': {
          const jobId = optionalUuid(req.body.jobId, 'jobId');
          if (!jobId) throw httpBadRequest('jobId is required');
          op = { action, jobId };
          break;
        }
        case 'delete':
          op = { action };
          break;
        default:
          throw httpBadRequest('Unknown bulk action');
      }
      const result = await candidateService.bulk(ids, op);
      await auditLogService.log(req.user!, `BULK_${action.replace(/([A-Z])/g, '_$1').toUpperCase()}`, 'candidate', ids[0], {
        count: ids.length,
        ...op,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  previewImport: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const rows = parseImportRows(req.body.rows);
      res.json({ success: true, data: await candidateService.previewImport(rows) });
    } catch (err) {
      next(err);
    }
  },

  importCandidates: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const rows = parseImportRows(req.body.rows);
      const strategy = (optionalEnum(req.body.strategy, ['skip', 'update', 'create'] as const, 'Duplicate handling') ??
        'skip') as DuplicateStrategy;
      const jobId = optionalUuid(req.body.jobId, 'jobId') ?? undefined;
      const result = await candidateService.importCandidates(rows, strategy, jobId);
      await auditLogService.log(req.user!, 'IMPORT_CANDIDATES', 'candidate', result.ids[0] ?? 'import', {
        rows: rows.length,
        strategy,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors.length,
      });
      res.json({ success: true, data: { ...result, ids: undefined } });
    } catch (err) {
      next(err);
    }
  },

  submitToClient: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const jobId = optionalUuid(req.body.jobId, 'jobId');
      if (!jobId) throw httpBadRequest('jobId is required');
      const note = optionalString(req.body.note, 'Submission note', 5000) || null;
      const updated = await candidateService.submitToClient(req.params.id, jobId, req.user!.email, note);
      await auditLogService.log(req.user!, 'SUBMIT_TO_CLIENT', 'candidate', req.params.id, { jobId, note });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
};

/** Validates each import row with the same rules as a manual create. */
function parseImportRows(value: unknown): ImportRow[] {
  if (!Array.isArray(value) || !value.length) throw httpBadRequest('No rows to import');
  if (value.length > MAX_IMPORT_ROWS) throw httpBadRequest(`Import at most ${MAX_IMPORT_ROWS} rows at a time`);
  return value.map((raw, i) => {
    try {
      const r = (raw ?? {}) as Record<string, unknown>;
      const str = (k: string, max = 500) => optionalString(r[k] == null ? undefined : String(r[k]), k, max) || undefined;
      const email = str('email', 320);
      if (email) assertValidEmail(email);
      return {
        ...parseProfileFields(r),
        name: str('name'),
        firstName: str('firstName', 100),
        lastName: str('lastName', 100),
        email,
        phone: str('phone', 50),
        currentTitle: str('currentTitle', 200),
        currentCompany: str('currentCompany', 200),
        location: str('location', 200),
        skills: optionalStringArray(r.skills, 'Skills', 100),
        linkedinUrl: str('linkedinUrl', 500),
        website: str('website', 500),
        notes: str('notes', 10_000),
        noticePeriod: optionalNumber(r.noticePeriod, 'Notice period', { min: 0, integer: true }),
      } as ImportRow;
    } catch (err) {
      throw httpBadRequest(`Row ${i + 1}: ${(err as Error).message}`);
    }
  });
}
