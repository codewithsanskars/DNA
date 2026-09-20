import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { organizationService } from '../services/organization.service';
import { auditLogService } from '../services/auditLog.service';

// Same pattern the browser's own `type="email"` validation uses (the
// WHATWG HTML spec's email regex).
const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

function assertValidEmail(value: unknown): void {
  if (value === undefined || value === null || value === '') return;
  if (!EMAIL_RE.test(String(value).trim())) {
    throw Object.assign(new Error('Email must be a valid email address'), { statusCode: 400 });
  }
}

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
      const canSeeAll = req.user!.role === 'ADMIN';
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
      const canSeeAll = req.user!.role === 'ADMIN';
      if (!canSeeAll && req.params.id !== req.user!.organizationId) {
        res.status(403).json({ success: false, error: 'Access denied to this organization' });
        return;
      }
      const data = await organizationService.getOrganizationProfile(req.params.id);
      if (!data) {
        res.status(404).json({ success: false, error: 'Organization not found' });
        return;
      }
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  scrapeCompanyPage: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== 'string') {
        res.status(400).json({ success: false, error: 'A URL is required' });
        return;
      }
      const data = await organizationService.scrapeCompanyPage(url);
      res.json({ success: true, data });
    } catch (err) {
      // Bad input / unreachable page / SSRF-guard rejection all surface as a
      // plain Error with a user-facing message — anything else is unexpected.
      if (err instanceof Error) {
        res.status(422).json({ success: false, error: err.message });
        return;
      }
      next(err);
    }
  },

  createOrganization: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { name, industry, website, logoUrl, email, description, hq, employeeCount, founded, socialLinks } =
        req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ success: false, error: 'Company name is required' });
        return;
      }
      assertValidEmail(email);

      const org = await organizationService.createOrganization({
        name: name.trim(),
        industry: industry || undefined,
        website: website || undefined,
        logoUrl: logoUrl || undefined,
        email: email || undefined,
        description: description || undefined,
        hq: hq || undefined,
        employeeCount:
          employeeCount !== undefined && employeeCount !== null && employeeCount !== ''
            ? Number(employeeCount)
            : undefined,
        founded: founded || undefined,
        socialLinks: socialLinks || undefined,
      });

      await auditLogService.log(req.user!, 'CREATE_ORGANIZATION', 'organization', org._id, { name: org.name });
      res.status(201).json({ success: true, data: org });
    } catch (err) {
      next(err);
    }
  },
};
