import { Router } from 'express';
import { candidateController } from '../controllers/candidate.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { uploadResume, uploadCandidatePhoto } from '../middleware/upload.middleware';
import { redactCandidatesForClient } from '../middleware/redact.middleware';

const router = Router();

// Strips SWFS-internal fields (CTC, tags, owner…) from every CLIENT response.
router.use(authenticate, redactCandidatesForClient);

// Recruiter-only collection routes — registered before '/:id' so they aren't
// swallowed by it.
router.get('/list', authenticate, candidateController.list);
router.get('/search', authenticate, requireRole('ADMIN'), candidateController.search);
router.get('/duplicates', authenticate, requireRole('ADMIN'), candidateController.findDuplicates);
router.get('/tags', authenticate, requireRole('ADMIN'), candidateController.getTags);
router.post('/bulk', authenticate, requireRole('ADMIN'), candidateController.bulk);
router.post('/import/preview', authenticate, requireRole('ADMIN'), candidateController.previewImport);
router.post('/import', authenticate, requireRole('ADMIN'), candidateController.importCandidates);

router.get('/', authenticate, candidateController.getCandidates);
router.post('/', authenticate, requireRole('ADMIN'), candidateController.createCandidate);
router.get('/:id', authenticate, candidateController.getCandidate);
router.patch('/:id', authenticate, requireRole('ADMIN'), candidateController.updateCandidate);
router.delete('/:id', authenticate, requireRole('ADMIN'), candidateController.deleteCandidate);
router.patch('/:id/stage', authenticate, requireRole('CLIENT', 'ADMIN'), candidateController.setStage);
router.post('/:id/submit', authenticate, requireRole('ADMIN'), candidateController.submitToClient);
router.get('/:id/resume', authenticate, candidateController.downloadResume);
router.get('/:id/pdf', authenticate, candidateController.downloadPdf);
router.post('/:id/resume', authenticate, requireRole('ADMIN'), uploadResume, candidateController.uploadResume);
router.delete('/:id/resume', authenticate, requireRole('ADMIN'), candidateController.deleteResume);
router.get('/:id/photo', authenticate, candidateController.getPhoto);
router.post('/:id/photo', authenticate, requireRole('ADMIN'), uploadCandidatePhoto, candidateController.uploadPhoto);
router.delete('/:id/photo', authenticate, requireRole('ADMIN'), candidateController.deletePhoto);
router.post('/:id/shortlist', authenticate, requireRole('CLIENT', 'ADMIN'), candidateController.shortlist);
router.post('/:id/select', authenticate, requireRole('CLIENT', 'ADMIN'), candidateController.selectCandidate);
router.post('/:id/reject', authenticate, requireRole('CLIENT', 'ADMIN'), candidateController.reject);
router.post('/:id/request-interview', authenticate, requireRole('CLIENT', 'ADMIN'), candidateController.requestInterview);
router.post('/:id/feedback', authenticate, requireRole('CLIENT', 'ADMIN'), candidateController.submitFeedback);
router.delete('/:id/feedback/:feedbackId', authenticate, requireRole('CLIENT', 'ADMIN'), candidateController.deleteFeedback);
router.post('/:id/interview-feedback', authenticate, requireRole('CLIENT', 'ADMIN'), candidateController.submitInterviewFeedback);
router.delete(
  '/:id/interview-feedback/:feedbackId',
  authenticate,
  requireRole('CLIENT', 'ADMIN'),
  candidateController.deleteInterviewFeedback
);
router.post('/:id/link-job', authenticate, requireRole('CLIENT', 'ADMIN'), candidateController.linkJob);
router.patch('/:id/global-status', authenticate, requireRole('ADMIN'), candidateController.updateGlobalStatus);
router.patch('/:id/status', authenticate, requireRole('ADMIN'), candidateController.updateStatus);

export default router;
