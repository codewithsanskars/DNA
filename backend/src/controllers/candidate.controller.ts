import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { candidateService } from '../services/candidate.service';
import { auditLogService } from '../services/auditLog.service';

export const candidateController = {
  getCandidate: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const candidate = await candidateService.getCandidateById(
        req.params.id,
        req.user!.organizationId
      );
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
      const updated = await candidateService.shortlistCandidate(
        req.params.id,
        req.user!.organizationId
      );
      await auditLogService.log(req.user!, 'SHORTLIST', 'candidate', req.params.id, {});
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },

  reject: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const updated = await candidateService.rejectCandidate(
        req.params.id,
        req.user!.organizationId
      );
      await auditLogService.log(req.user!, 'REJECT', 'candidate', req.params.id, {});
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },

  requestInterview: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const updated = await candidateService.requestInterview(
        req.params.id,
        req.user!.organizationId,
        req.body
      );
      await auditLogService.log(req.user!, 'REQUEST_INTERVIEW', 'candidate', req.params.id, req.body);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },

  submitFeedback: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { feedback, rating } = req.body;
      const result = await candidateService.submitFeedback(
        req.params.id,
        req.user!.organizationId,
        feedback,
        rating
      );
      await auditLogService.log(req.user!, 'SUBMIT_FEEDBACK', 'candidate', req.params.id, { feedback, rating });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  createCandidate: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { jobId, firstName, lastName, email, phone, currentTitle, currentCompany, location, skills, linkedinUrl } = req.body;
      if (!jobId || !firstName || !lastName || !email) {
        res.status(400).json({ success: false, error: 'jobId, firstName, lastName, and email are required' });
        return;
      }
      const candidate = await candidateService.createCandidate(req.user!.organizationId, jobId, {
        firstName,
        lastName,
        email,
        phone,
        currentTitle,
        currentCompany,
        location,
        skills,
        linkedinUrl,
      });
      await auditLogService.log(req.user!, 'CREATE_CANDIDATE', 'candidate', candidate._id, { jobId, email });
      res.status(201).json({ success: true, data: candidate });
    } catch (err) {
      next(err);
    }
  },
};
