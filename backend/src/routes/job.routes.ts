import { Router } from 'express';
import { jobController } from '../controllers/job.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole, requireExactRole } from '../middleware/rbac.middleware';
import { uploadJobDescription } from '../middleware/upload.middleware';
import { redactCandidatesForClient } from '../middleware/redact.middleware';

const router = Router();

// The pipeline endpoint returns candidates — keep their internal fields from clients.
router.use(authenticate, redactCandidatesForClient);

router.get('/', authenticate, jobController.getJobs);
router.post('/', authenticate, requireRole('CLIENT', 'ADMIN'), jobController.createJob);
router.get('/:id', authenticate, jobController.getJob);
router.patch('/:id', authenticate, requireRole('CLIENT', 'ADMIN'), jobController.updateJob);
router.delete('/:id', authenticate, requireRole('ADMIN'), jobController.deleteJob);
router.get('/:id/pipeline', authenticate, jobController.getJobPipeline);
router.get('/:id/description', authenticate, jobController.downloadJobDescription);
// Only the client who owns the role attaches its job description — not SWFS staff.
router.post('/:id/description', authenticate, requireExactRole('CLIENT'), uploadJobDescription, jobController.uploadJobDescription);
router.delete('/:id/description', authenticate, requireExactRole('CLIENT'), jobController.deleteJobDescription);

export default router;
