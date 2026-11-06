import { Router, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { AuthenticatedRequest } from '../types';
import { digestService } from '../services/digest.service';

const router = Router();

// The digest is a recruiter tool: SWFS staff only.
router.use(authenticate, requireRole('ADMIN'));

/** GET /api/digest?scope=mine|team&refresh=1 */
router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const scope = req.query.scope === 'team' ? 'team' : 'mine';
    const data = await digestService.build(req.user!.userId, scope, { refresh: req.query.refresh === '1' });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

/** POST /api/digest/send: send today's digest notifications now (idempotent; useful for testing). */
router.post('/send', async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await digestService.sendDailyNotifications() });
  } catch (err) {
    next(err);
  }
});

export default router;
