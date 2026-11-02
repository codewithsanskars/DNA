import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { notificationService } from '../services/notification.service';
import { badRequest, optionalNumber, optionalStringArray, optionalUuid } from '../utils/http';

/** The caller's own notifications only — the user id always comes from the token. */
export const notificationController = {
  list: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const before = typeof req.query.before === 'string' ? new Date(req.query.before) : undefined;
      if (before && Number.isNaN(before.getTime())) throw badRequest('before must be a date');
      const data = await notificationService.list(req.user!.userId, {
        unreadOnly: req.query.unread === 'true',
        limit: optionalNumber(req.query.limit, 'limit', { min: 1, max: 100, integer: true }) ?? 30,
        before,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  unreadCount: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      res.json({ success: true, data: { count: await notificationService.unreadCount(req.user!.userId) } });
    } catch (err) {
      next(err);
    }
  },

  markRead: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const ids = (optionalStringArray(req.body.ids, 'ids', 200) ?? []).map((id) => optionalUuid(id, 'id')!);
      await notificationService.markRead(req.user!.userId, ids);
      res.json({ success: true, data: { count: await notificationService.unreadCount(req.user!.userId) } });
    } catch (err) {
      next(err);
    }
  },

  markAllRead: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await notificationService.markAllRead(req.user!.userId);
      res.json({ success: true, data: { count: 0 } });
    } catch (err) {
      next(err);
    }
  },
};
