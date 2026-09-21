import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { uploadAvatar } from '../middleware/upload.middleware';

const router = Router();

router.post('/login', authController.login);
router.get('/okta/status', authController.oktaStatus);
router.get('/okta/login', authController.oktaLogin);
router.get('/okta/callback', authController.oktaCallback);
router.post('/okta/register', authController.completeOktaRegistration);
router.get('/me', authenticate, authController.me);
router.patch('/me', authenticate, authController.updateMe);
router.post('/me/avatar', authenticate, uploadAvatar, authController.uploadMyAvatar);
router.delete('/me/avatar', authenticate, authController.removeMyAvatar);

export default router;
