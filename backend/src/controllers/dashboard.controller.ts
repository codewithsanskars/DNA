import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { dashboardService } from '../services/dashboard.service';
import { insightsService } from '../services/insights.service';
import { isAdminRole } from '../utils/roles';

export const dashboardController = {
  getSummary: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = isAdminRole(req.user!.role)
        ? await dashboardService.getGlobalSummary()
        : await dashboardService.getSummary(req.user!.organizationId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  getClientHome: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      res.json({ success: true, data: await dashboardService.getClientHome(req.user!.organizationId) });
    } catch (err) {
      next(err);
    }
  },

  /** Chart + KPI data for the dashboard, scoped to the caller (all clients for admins). */
  getInsights: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const org = isAdminRole(req.user!.role) ? null : req.user!.organizationId;
      res.json({ success: true, data: await insightsService.get(org) });
    } catch (err) {
      next(err);
    }
  },
};
