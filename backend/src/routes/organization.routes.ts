import { Router } from 'express';
import { organizationController } from '../controllers/organization.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticate, organizationController.getProfile);
router.get('/list', authenticate, organizationController.getOrganizations);
router.get('/:id', authenticate, organizationController.getOrganization);

export default router;
