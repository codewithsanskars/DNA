import path from 'path';
import fs from 'fs';
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { jobService } from '../services/job.service';
import { candidateService } from '../services/candidate.service';
import { auditLogService } from '../services/auditLog.service';
import { organizationRepository } from '../repositories/organization.repository';
import { isAdminRole } from '../utils/roles';
import { JOB_DESCRIPTION_DIR } from '../middleware/upload.middleware';
import { JOB_STATUSES, JOB_PRIORITIES, WORK_TYPES, PAYROLL_TYPES } from '../entities/enums';

// Matches the Job entity's `numeric(10,2)` column definition — anything over
// this overflows the column and Postgres throws, which would otherwise
// surface as an opaque 500 instead of a clear validation message.
const MAX_RATE = 99_999_999.99;

function badRequest(message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode: 400 });
}

// payRate is SWFS-internal cost data — never let it (or the margin derived
// from it) reach a client response, no matter what the repository returns.
// billRate is the one rate a client is allowed to see.
function scopeJobForRole<T extends { payRate?: number; billRate?: number }>(
  job: T,
  isAdmin: boolean
): Omit<T, 'payRate'> & { payRate?: number; grossMargin?: number } {
  if (!isAdmin) {
    const { payRate, ...rest } = job;
    return rest;
  }
  const grossMargin =
    job.payRate != null && job.billRate != null ? Number((job.billRate - job.payRate).toFixed(2)) : undefined;
  return { ...job, grossMargin };
}

function parseRate(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  if (!Number.isFinite(num)) throw badRequest(`${label} must be a number`);
  if (num < 0) throw badRequest(`${label} can't be negative`);
  // Locale pinned to 'en-US' — toLocaleString() without one follows the
  // runtime's default locale, which grouped digits Indian-style
  // ("$9,99,99,999.99") on this host instead of "$99,999,999.99".
  if (num > MAX_RATE) throw badRequest(`${label} must be $${MAX_RATE.toLocaleString('en-US')} or less`);
  return num;
}

// billableHours is stored as a free-text string like "8 hrs/day", but the
// number in it still has to represent a real portion of a day: more than
// zero, no more than 24, and in half-hour increments (how it's billed).
function assertValidBillableHours(value: unknown): void {
  if (value === undefined || value === null || value === '') return;
  const match = String(value).match(/[\d.]+/);
  const num = match ? Number(match[0]) : NaN;
  if (!Number.isFinite(num)) throw badRequest('Billable hours must be a number');
  if (num <= 0 || num > 24) throw badRequest('Billable hours must be greater than 0 and no more than 24');
  if (Math.round(num * 2) !== num * 2) throw badRequest('Billable hours must be in increments of 0.5');
}

// Rejects a value that isn't one of the entity's known enum members — an
// out-of-range value would otherwise reach Postgres and throw an "invalid
// input value for enum ..." error, surfaced as an opaque 500.
function assertEnumValue<T extends string>(value: unknown, allowed: readonly T[], label: string): void {
  if (value === undefined || value === null || value === '') return;
  if (!allowed.includes(value as T)) {
    throw badRequest(`${label} must be one of: ${allowed.join(', ')}`);
  }
}

export const jobController = {
  getJobs: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const isAdmin = isAdminRole(req.user!.role);
      const data = isAdmin ? await jobService.getAllJobs() : await jobService.getJobsForOrganization(req.user!.organizationId);
      res.json({ success: true, data: data.map((job) => scopeJobForRole(job, isAdmin)) });
    } catch (err) {
      next(err);
    }
  },

  getJob: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const isAdmin = isAdminRole(req.user!.role);
      const orgScope = isAdmin ? null : req.user!.organizationId;
      const job = await jobService.getJobById(req.params.id, orgScope);
      if (!job) {
        res.status(404).json({ success: false, error: 'Job not found' });
        return;
      }
      res.json({ success: true, data: scopeJobForRole(job, isAdmin) });
    } catch (err) {
      next(err);
    }
  },

  getJobPipeline: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const orgScope = isAdminRole(req.user!.role) ? null : req.user!.organizationId;
      const job = await jobService.getJobById(req.params.id, orgScope);
      if (!job) {
        res.status(404).json({ success: false, error: 'Job not found' });
        return;
      }
      const candidates = await candidateService.getCandidatesForJob(req.params.id);
      res.json({ success: true, data: candidates });
    } catch (err) {
      next(err);
    }
  },

  createJob: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { title, department, location, status, priority, openedAt, description, payRate, billRate, billableHours, workType, payrollType, organizationId } = req.body;
      if (!title) {
        res.status(400).json({ success: false, error: 'Title is required' });
        return;
      }
      assertEnumValue(status, JOB_STATUSES, 'Status');
      assertEnumValue(priority, JOB_PRIORITIES, 'Priority');
      assertEnumValue(workType, WORK_TYPES, 'Type of work');
      assertEnumValue(payrollType, PAYROLL_TYPES, 'Payroll');
      assertValidBillableHours(billableHours);
      const isAdmin = isAdminRole(req.user!.role);

      // Only SWFS admin/recruiter may assign a job to a client other than their own org.
      let targetOrgId = req.user!.organizationId;
      if (isAdmin && organizationId) {
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
        priority,
        openedAt,
        description,
        // Pay rate is SWFS-internal cost data — only admins may set it, no
        // matter what a client's request body happens to include.
        payRate: isAdmin ? parseRate(payRate, 'Pay rate') : undefined,
        billRate: parseRate(billRate, 'Bill rate'),
        billableHours,
        workType,
        payrollType,
      });
      await auditLogService.log(req.user!, 'CREATE_JOB', 'job', job._id, { title, organizationId: targetOrgId });
      res.status(201).json({ success: true, data: scopeJobForRole(job, isAdmin) });
    } catch (err) {
      next(err);
    }
  },

  updateJob: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { title, department, location, status, priority, description, payRate, billRate, billableHours, workType, payrollType } = req.body;
      assertEnumValue(status, JOB_STATUSES, 'Status');
      assertEnumValue(priority, JOB_PRIORITIES, 'Priority');
      assertEnumValue(workType, WORK_TYPES, 'Type of work');
      assertEnumValue(payrollType, PAYROLL_TYPES, 'Payroll');
      assertValidBillableHours(billableHours);
      const isAdmin = isAdminRole(req.user!.role);
      const orgScope = isAdmin ? null : req.user!.organizationId;
      const job = await jobService.updateJob(req.params.id, orgScope, {
        title,
        department,
        location,
        status,
        priority,
        description,
        // Pay rate is SWFS-internal cost data — only admins may set it, no
        // matter what a client's request body happens to include.
        payRate: isAdmin ? parseRate(payRate, 'Pay rate') : undefined,
        billRate: parseRate(billRate, 'Bill rate'),
        billableHours,
        workType,
        payrollType,
      });
      await auditLogService.log(req.user!, 'UPDATE_JOB', 'job', req.params.id, req.body);
      res.json({ success: true, data: scopeJobForRole(job, isAdmin) });
    } catch (err) {
      next(err);
    }
  },

  uploadJobDescription: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: 'A .pdf or .docx job description file is required' });
        return;
      }
      const orgScope = isAdminRole(req.user!.role) ? null : req.user!.organizationId;
      const { job, previous } = await jobService.setDescriptionFile(
        req.params.id,
        orgScope,
        req.file.filename,
        req.file.originalname
      );
      if (previous) fs.unlink(path.join(JOB_DESCRIPTION_DIR, previous.storedName), () => {});
      await auditLogService.log(req.user!, 'UPLOAD_JOB_DESCRIPTION', 'job', req.params.id, {
        fileName: req.file.originalname,
      });
      res.json({ success: true, data: job });
    } catch (err) {
      if (req.file) fs.unlink(req.file.path, () => {});
      next(err);
    }
  },

  downloadJobDescription: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const orgScope = isAdminRole(req.user!.role) ? null : req.user!.organizationId;
      const file = await jobService.getDescriptionFile(req.params.id, orgScope);
      if (!file) {
        res.status(404).json({ success: false, error: 'Job description not found' });
        return;
      }
      const filePath = path.join(JOB_DESCRIPTION_DIR, file.storedName);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ success: false, error: 'Job description file is missing' });
        return;
      }
      res.download(filePath, file.fileName || file.storedName);
    } catch (err) {
      next(err);
    }
  },

  deleteJobDescription: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const orgScope = isAdminRole(req.user!.role) ? null : req.user!.organizationId;
      const { job, previous } = await jobService.deleteDescriptionFile(req.params.id, orgScope);
      if (previous) fs.unlink(path.join(JOB_DESCRIPTION_DIR, previous.storedName), () => {});
      await auditLogService.log(req.user!, 'DELETE_JOB_DESCRIPTION', 'job', req.params.id, {});
      res.json({ success: true, data: job });
    } catch (err) {
      next(err);
    }
  },
};
