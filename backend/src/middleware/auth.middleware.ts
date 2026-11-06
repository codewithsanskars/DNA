import { Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { AuthenticatedRequest } from '../types';
import { AppDataSource } from '../config/data-source';

// A token can outlive its user: the user was deactivated or deleted, or the
// database was re-seeded with new ids. Such a token must be treated as signed
// out, or every write that references the stale user/org id fails on a
// foreign key. Checked once per user per minute to keep requests cheap.
const USER_CHECK_TTL_MS = 60_000;
const userCheckCache = new Map<string, { ok: boolean; at: number }>();

async function userStillValid(userId: string): Promise<boolean> {
  if (!AppDataSource.isInitialized) return true; // no DB (mock mode): nothing to check against
  const hit = userCheckCache.get(userId);
  if (hit && Date.now() - hit.at < USER_CHECK_TTL_MS) return hit.ok;
  const rows: { ok: boolean }[] = await AppDataSource.query(`SELECT "isActive" AS ok FROM users WHERE id = $1`, [userId]);
  const ok = rows.length > 0 && rows[0].ok !== false;
  userCheckCache.set(userId, { ok, at: Date.now() });
  return ok;
}

export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'No token provided' });
    return;
  }

  let payload;
  try {
    payload = authService.verifyToken(authHeader.split(' ')[1]);
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
    return;
  }

  try {
    if (!(await userStillValid(payload.userId))) {
      res.status(401).json({ success: false, error: 'Your session is no longer valid. Please sign in again.' });
      return;
    }
  } catch {
    // A transient DB error shouldn't sign everyone out; the request proceeds as before.
  }

  req.user = payload;
  next();
}
