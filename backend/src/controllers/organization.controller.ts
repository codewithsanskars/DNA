import { pdfService } from '../services/pdf.service';
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { organizationService } from '../services/organization.service';
import { auditLogService } from '../services/auditLog.service';
import { badRequest, optionalNumber, optionalString, requiredString } from '../utils/http';

function contactFields(body: Record<string, unknown>, requireName: boolean) {
  const email = optionalString(body.email, 'Email', 320);
  assertValidEmail(email);
  const fields = {
    name: requireName ? requiredString(body.name, 'Name', 200) : optionalString(body.name, 'Name', 200),
    title: optionalString(body.title, 'Title', 200),
    email,
    phone: optionalString(body.phone, 'Phone', 50),
    linkedinUrl: optionalString(body.linkedinUrl, 'LinkedIn URL', 500),
    notes: optionalString(body.notes, 'Notes', 5000),
    isDecisionMaker: typeof body.isDecisionMaker === 'boolean' ? body.isDecisionMaker : undefined,
    isHiringManager: typeof body.isHiringManager === 'boolean' ? body.isHiringManager : undefined,
  };
  if (fields.name === '') throw badRequest('Name cannot be empty');
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
}

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

  /** GET /organization/:id/pdf — clients only for their own org. */
  downloadPdf: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const isAdmin = req.user!.role === 'ADMIN';
      if (!isAdmin && req.params.id !== req.user!.organizationId) {
        res.status(403).json({ success: false, error: 'Access denied to this organization' });
        return;
      }
      const { buffer, fileName } = await pdfService.organizationProfile(req.params.id, isAdmin);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(buffer);
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

  updateOrganization: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const b = req.body;
      const name = optionalString(b.name, 'Company name', 200);
      if (name === '') throw badRequest('Company name cannot be empty');
      const email = optionalString(b.email, 'Email', 320);
      assertValidEmail(email);
      const employeeCount = optionalNumber(b.employeeCount, 'Employee count', { min: 0, integer: true });
      const input = Object.fromEntries(
        Object.entries({
          name,
          industry: optionalString(b.industry, 'Industry', 200),
          website: optionalString(b.website, 'Website', 500),
          logoUrl: optionalString(b.logoUrl, 'Logo URL', 1000),
          email,
          description: optionalString(b.description, 'Description', 10_000),
          hq: optionalString(b.hq, 'Headquarters', 200),
          employeeCount: employeeCount === null ? undefined : employeeCount,
          founded: optionalString(b.founded, 'Founded', 50),
          socialLinks: b.socialLinks && typeof b.socialLinks === 'object' ? b.socialLinks : undefined,
        }).filter(([, v]) => v !== undefined)
      );
      const org = await organizationService.updateOrganization(req.params.id, input);
      await auditLogService.log(req.user!, 'UPDATE_ORGANIZATION', 'organization', req.params.id, input);
      res.json({ success: true, data: org });
    } catch (err) {
      next(err);
    }
  },

  addContact: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const org = await organizationService.addContact(req.params.id, contactFields(req.body, true));
      await auditLogService.log(req.user!, 'ADD_CONTACT', 'organization', req.params.id, { name: req.body.name });
      res.status(201).json({ success: true, data: org });
    } catch (err) {
      next(err);
    }
  },

  updateContact: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const org = await organizationService.updateContact(req.params.id, req.params.contactId, contactFields(req.body, false));
      await auditLogService.log(req.user!, 'UPDATE_CONTACT', 'organization', req.params.id, { contactId: req.params.contactId });
      res.json({ success: true, data: org });
    } catch (err) {
      next(err);
    }
  },

  deleteContact: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const org = await organizationService.deleteContact(req.params.id, req.params.contactId);
      await auditLogService.log(req.user!, 'DELETE_CONTACT', 'organization', req.params.id, { contactId: req.params.contactId });
      res.json({ success: true, data: org });
    } catch (err) {
      next(err);
    }
  },
};
