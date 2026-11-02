import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireExactRole } from '../middleware/rbac.middleware';

const router = Router();

router.get('/', authenticate, dashboardController.getSummary);
router.get('/insights', authenticate, dashboardController.getInsights);
// Client org users only — SWFS staff have their own dashboard.
router.get('/client-home', authenticate, requireExactRole('CLIENT'), dashboardController.getClientHome);

export default router;
