import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { dashboardService } from '../services/dashboard.service';

export const dashboardController = {
  getSummary: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await dashboardService.getSummary(req.user!.organizationId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
};
