import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { jobService } from '../services/job.service';
import { candidateService } from '../services/candidate.service';
import { auditLogService } from '../services/auditLog.service';

export const jobController = {
  getJobs: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await jobService.getJobsForOrganization(req.user!.organizationId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  getJob: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const job = await jobService.getJobById(req.params.id, req.user!.organizationId);
      if (!job) {
        res.status(404).json({ success: false, error: 'Job not found' });
        return;
      }
      res.json({ success: true, data: job });
    } catch (err) {
      next(err);
    }
  },

  getJobPipeline: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const candidates = await candidateService.getCandidatesForJob(
        req.params.id,
        req.user!.organizationId
      );
      res.json({ success: true, data: candidates });
    } catch (err) {
      next(err);
    }
  },

  createJob: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { title, department, location, status, openedAt, description, payRate, billableHours, workType, payrollType } = req.body;
      if (!title) {
        res.status(400).json({ success: false, error: 'Title is required' });
        return;
      }
      const job = await jobService.createJob(req.user!.organizationId, {
        title,
        department,
        location,
        status,
        openedAt,
        description,
        payRate,
        billableHours,
        workType,
        payrollType,
      });
      await auditLogService.log(req.user!, 'CREATE_JOB', 'job', job._id, { title });
      res.status(201).json({ success: true, data: job });
    } catch (err) {
      next(err);
    }
  },
};
