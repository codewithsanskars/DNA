import path from 'path';
import fs from 'fs';
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { candidateService } from '../services/candidate.service';
import { auditLogService } from '../services/auditLog.service';
import { isAdminRole } from '../utils/roles';
import { RESUME_DIR } from '../middleware/upload.middleware';

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
      const candidate = await candidateService.getCandidateById(req.params.id, orgScope);
      if (!candidate) {
        res.status(404).json({ success: false, error: 'Candidate not found' });
        return;
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
        currentTitle,
        currentCompany,
        location,
        skills,
        linkedinUrl,
        website,
        notes,
      } = req.body;
      const orgScope = isAdminRole(req.user!.role) ? null : req.user!.organizationId;
      const updated = await candidateService.updateCandidate(req.params.id, orgScope, {
        firstName,
        lastName,
        email,
        phone,
        currentTitle,
        currentCompany,
        location,
        skills,
        linkedinUrl,
        website,
        notes,
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
      const updated = await candidateService.rejectCandidate(req.params.id, jobId, orgScope);
      await auditLogService.log(req.user!, 'REJECT', 'candidate', req.params.id, { jobId });
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

  createCandidate: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { jobId, firstName, lastName, email, phone, currentTitle, currentCompany, location, skills, linkedinUrl, website, source } = req.body;
      if (!firstName || !lastName) {
        res.status(400).json({ success: false, error: 'firstName and lastName are required' });
        return;
      }
      const candidateSource = ['PORTAL', 'LINKEDIN'].includes(source) ? source : 'PORTAL';

      const candidate = await candidateService.createCandidate(jobId || undefined, {
        firstName,
        lastName,
        email,
        phone,
        currentTitle,
        currentCompany,
        location,
        skills,
        linkedinUrl,
        website,
        source: candidateSource,
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
};
