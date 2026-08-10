import { Router } from 'express';
import { jobController } from '../controllers/job.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';

const router = Router();

router.get('/', authenticate, jobController.getJobs);
router.post('/', authenticate, requireRole('HIRING_MANAGER', 'CLIENT_ADMIN', 'SWFS_ADMIN'), jobController.createJob);
router.get('/:id', authenticate, jobController.getJob);
router.get('/:id/pipeline', authenticate, jobController.getJobPipeline);

export default router;
