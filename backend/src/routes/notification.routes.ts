import { Router } from 'express';
import { notificationController } from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth.middleware';

// Both roles — each caller only ever sees their own notifications.
const router = Router();
router.use(authenticate);

router.get('/', notificationController.list);
router.get('/unread-count', notificationController.unreadCount);
router.post('/read', notificationController.markRead);
router.post('/read-all', notificationController.markAllRead);

export default router;
