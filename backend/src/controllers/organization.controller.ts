import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { organizationService } from '../services/organization.service';

export const organizationController = {
  getProfile: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await organizationService.getOrganizationProfile(req.user!.organizationId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  getOrganizations: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const canSeeAll = req.user!.role === 'SWFS_ADMIN' || req.user!.role === 'SWFS_RECRUITER';
      if (canSeeAll) {
        const data = await organizationService.getAllOrganizationProfiles();
        res.json({ success: true, data });
        return;
      }
      const data = await organizationService.getOrganizationProfile(req.user!.organizationId);
      res.json({ success: true, data: [data] });
    } catch (err) {
      next(err);
    }
  },

  getOrganization: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const canSeeAll = req.user!.role === 'SWFS_ADMIN' || req.user!.role === 'SWFS_RECRUITER';
      if (!canSeeAll && req.params.id !== req.user!.organizationId) {
        res.status(403).json({ success: false, error: 'Access denied to this organization' });
        return;
      }
      const data = await organizationService.getOrganizationProfile(req.params.id);
      if (!data.name) {
        res.status(404).json({ success: false, error: 'Organization not found' });
        return;
      }
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
};
