import { Router } from 'express';
import { candidateController } from '../controllers/candidate.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { uploadResume } from '../middleware/upload.middleware';

const router = Router();

router.get('/', authenticate, candidateController.getCandidates);
router.post('/', authenticate, requireRole('ADMIN'), candidateController.createCandidate);
router.get('/:id', authenticate, candidateController.getCandidate);
router.get('/:id/resume', authenticate, candidateController.downloadResume);
router.post('/:id/resume', authenticate, requireRole('CLIENT', 'ADMIN'), uploadResume, candidateController.uploadResume);
router.delete('/:id/resume', authenticate, requireRole('CLIENT', 'ADMIN'), candidateController.deleteResume);
router.post('/:id/shortlist', authenticate, requireRole('CLIENT', 'ADMIN'), candidateController.shortlist);
router.post('/:id/reject', authenticate, requireRole('CLIENT', 'ADMIN'), candidateController.reject);
router.post('/:id/request-interview', authenticate, requireRole('CLIENT', 'ADMIN'), candidateController.requestInterview);
router.post('/:id/feedback', authenticate, requireRole('CLIENT', 'ADMIN'), candidateController.submitFeedback);
router.post('/:id/link-job', authenticate, requireRole('CLIENT', 'ADMIN'), candidateController.linkJob);

export default router;
