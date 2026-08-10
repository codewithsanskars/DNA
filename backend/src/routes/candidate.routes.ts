import { Router } from 'express';
import { candidateController } from '../controllers/candidate.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';

const router = Router();

router.post('/', authenticate, requireRole('HIRING_MANAGER', 'CLIENT_ADMIN', 'SWFS_ADMIN'), candidateController.createCandidate);
router.get('/:id', authenticate, candidateController.getCandidate);
router.post('/:id/shortlist', authenticate, requireRole('HIRING_MANAGER', 'CLIENT_ADMIN', 'SWFS_ADMIN'), candidateController.shortlist);
router.post('/:id/reject', authenticate, requireRole('HIRING_MANAGER', 'CLIENT_ADMIN', 'SWFS_ADMIN'), candidateController.reject);
router.post('/:id/request-interview', authenticate, requireRole('HIRING_MANAGER', 'CLIENT_ADMIN', 'SWFS_ADMIN'), candidateController.requestInterview);
router.post('/:id/feedback', authenticate, requireRole('HIRING_MANAGER', 'CLIENT_ADMIN', 'SWFS_ADMIN'), candidateController.submitFeedback);

export default router;
