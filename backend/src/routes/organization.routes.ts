import { Router } from 'express';
import { organizationController } from '../controllers/organization.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';

const router = Router();

router.get('/', authenticate, organizationController.getProfile);
router.get('/list', authenticate, organizationController.getOrganizations);
// Only SWFS staff manage the client roster, so scraping/creating are admin-only.
router.post('/scrape', authenticate, requireRole('ADMIN'), organizationController.scrapeCompanyPage);
router.post('/', authenticate, requireRole('ADMIN'), organizationController.createOrganization);
router.get('/:id', authenticate, organizationController.getOrganization);

export default router;
