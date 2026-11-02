import { Router } from 'express';
import authRoutes from './auth.routes';
import dashboardRoutes from './dashboard.routes';
import jobRoutes from './job.routes';
import candidateRoutes from './candidate.routes';
import organizationRoutes from './organization.routes';
import activityRoutes from './activity.routes';
import workflowRoutes from './workflow.routes';
import pipelineRoutes from './pipeline.routes';
import notificationRoutes from './notification.routes';
import aiRoutes from './ai.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/jobs', jobRoutes);
router.use('/candidates', candidateRoutes);
router.use('/organization', organizationRoutes);
router.use('/activity', activityRoutes);
router.use('/workflow', workflowRoutes);
router.use('/pipeline', pipelineRoutes);
router.use('/notifications', notificationRoutes);
router.use('/ai', aiRoutes);

export default router;
