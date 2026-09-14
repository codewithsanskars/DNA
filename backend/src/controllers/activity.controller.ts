import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { auditLogService } from '../services/auditLog.service';
import { isAdminRole } from '../utils/roles';

export const activityController = {
  getActivity: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
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
