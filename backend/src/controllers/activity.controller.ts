import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { auditLogService } from '../services/auditLog.service';
import { isAdminRole } from '../utils/roles';

export const activityController = {
  getActivity: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (req.query.page !== undefined) {
        const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
        const pageSize = Math.min(200, Math.max(1, parseInt(String(req.query.pageSize ?? '50'), 10) || 50));
        const orgScope = isAdminRole(req.user!.role) ? null : req.user!.organizationId;
        res.json({ success: true, data: await auditLogService.getActivityPage(orgScope, page, pageSize) });
        return;
      }
      const limit = parseInt((req.query.limit as string) || '50', 10);
      const data = isAdminRole(req.user!.role)
        ? await auditLogService.getAllActivity(limit)
        : await auditLogService.getOrganizationActivity(req.user!.organizationId, limit);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
};
