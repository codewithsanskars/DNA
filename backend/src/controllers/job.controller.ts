import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { jobService } from '../services/job.service';
import { candidateService } from '../services/candidate.service';
import { auditLogService } from '../services/auditLog.service';
import { organizationRepository } from '../repositories/organization.repository';
import { isAdminRole } from '../utils/roles';

export const jobController = {
  getJobs: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = isAdminRole(req.user!.role)
        ? await jobService.getAllJobs()
        : await jobService.getJobsForOrganization(req.user!.organizationId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  getJob: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const orgScope = isAdminRole(req.user!.role) ? null : req.user!.organizationId;
      const job = await jobService.getJobById(req.params.id, orgScope);
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
      const orgScope = isAdminRole(req.user!.role) ? null : req.user!.organizationId;
      const candidates = await candidateService.getCandidatesForJob(req.params.id, orgScope);
      res.json({ success: true, data: candidates });
    } catch (err) {
      next(err);
    }
  },

  createJob: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { title, department, location, status, openedAt, description, payRate, billableHours, workType, payrollType, organizationId } = req.body;
      if (!title) {
        res.status(400).json({ success: false, error: 'Title is required' });
        return;
      }

      // Only SWFS admin/recruiter may assign a job to a client other than their own org.
      let targetOrgId = req.user!.organizationId;
      if (isAdminRole(req.user!.role) && organizationId) {
        const org = await organizationRepository.findById(organizationId);
        if (!org) {
          res.status(400).json({ success: false, error: 'Selected client not found' });
          return;
        }
        targetOrgId = organizationId;
      }

      const job = await jobService.createJob(targetOrgId, {
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
      await auditLogService.log(req.user!, 'CREATE_JOB', 'job', job._id, { title, organizationId: targetOrgId });
      res.status(201).json({ success: true, data: job });
    } catch (err) {
      next(err);
    }
  },
};
