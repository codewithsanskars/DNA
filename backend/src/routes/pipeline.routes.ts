import { Router } from 'express';
import { pipelineController } from '../controllers/pipeline.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';

// Interviews and offers are a shared client/SWFS workflow (clients run their
// own interviews and make the offer); placements are SWFS-only records.
// Every read/write is org-scoped for CLIENT callers in the service layer.
const router = Router();
router.use(authenticate);

router.get('/candidates/:candidateId', pipelineController.forCandidate);
router.get('/interviews/upcoming', pipelineController.upcomingInterviews);
router.get('/placements', pipelineController.listPlacements);

router.post('/interviews', requireRole('CLIENT', 'ADMIN'), pipelineController.scheduleInterview);
router.patch('/interviews/:id', requireRole('CLIENT', 'ADMIN'), pipelineController.updateInterview);

router.get('/scorecard-template', pipelineController.scorecardTemplate);
router.post('/scorecards', requireRole('CLIENT', 'ADMIN'), pipelineController.submitScorecard);
router.delete('/scorecards/:id', requireRole('CLIENT', 'ADMIN'), pipelineController.deleteScorecard);

router.post('/offers', requireRole('CLIENT', 'ADMIN'), pipelineController.extendOffer);
router.patch('/offers/:id', requireRole('CLIENT', 'ADMIN'), pipelineController.updateOffer);

router.post('/placements', requireRole('ADMIN'), pipelineController.createPlacement);
router.patch('/placements/:id', requireRole('ADMIN'), pipelineController.updatePlacement);

export default router;
