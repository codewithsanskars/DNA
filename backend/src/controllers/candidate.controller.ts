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
