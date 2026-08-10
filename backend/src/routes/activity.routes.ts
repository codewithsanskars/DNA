import { Router } from 'express';
import { activityController } from '../controllers/activity.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticate, activityController.getActivity);

export default router;
