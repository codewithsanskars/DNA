import { Router } from 'express';
import authRoutes from './auth.routes';
import dashboardRoutes from './dashboard.routes';
import jobRoutes from './job.routes';
import candidateRoutes from './candidate.routes';
import organizationRoutes from './organization.routes';
import activityRoutes from './activity.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/jobs', jobRoutes);
router.use('/candidates', candidateRoutes);
router.use('/organization', organizationRoutes);
router.use('/activity', activityRoutes);

export default router;
