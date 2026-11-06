import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { aiController } from '../controllers/ai.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { uploadResume } from '../middleware/upload.middleware';
import { AuthenticatedRequest } from '../types';

const router = Router();

// LLM calls are slow and (on OpenAI) billed, so cap them per user.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthenticatedRequest).user?.userId || req.ip || 'anon',
  message: { success: false, error: 'Too many AI requests. Wait a minute and try again.' },
});

router.use(authenticate);
router.get('/status', aiController.status);
// Cached analysis + cheap deterministic scoring, so not behind the LLM limiter.
router.get('/jobs/:jobId/insights', requireRole('CLIENT', 'ADMIN'), aiController.jobInsights);
router.get('/new-openings', requireRole('ADMIN'), aiController.newOpenings);
router.post('/match-preview', requireRole('ADMIN'), aiController.matchPreview);
router.use(aiLimiter);

// Both roles. Org scoping is enforced in the service (clients only see their own records).
router.post('/match', requireRole('CLIENT', 'ADMIN'), aiController.match);
router.post('/candidates/:id/summary', requireRole('CLIENT', 'ADMIN'), aiController.summarize);
router.post('/jobs/:jobId/analyze', requireRole('CLIENT', 'ADMIN'), aiController.analyzeJob);
router.post('/job-description', requireRole('CLIENT', 'ADMIN'), aiController.jobDescription);

// SWFS-only.
router.post('/parse-resume', requireRole('ADMIN'), uploadResume, aiController.parseResumeUpload);
router.post('/parse-resume/text', requireRole('ADMIN'), aiController.parseResumeText);
router.post('/candidates/:id/parse-resume', requireRole('ADMIN'), aiController.parseCandidateResume);
router.post('/candidates/:id/submission-note', requireRole('ADMIN'), aiController.submissionNote);
router.post('/jobs/:jobId/rank', requireRole('ADMIN'), aiController.rankPool);
router.post('/search', requireRole('ADMIN'), aiController.search);

export default router;
