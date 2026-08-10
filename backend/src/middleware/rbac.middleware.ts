import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, UserRole } from '../types';

const ROLE_HIERARCHY: Record<UserRole, number> = {
  SWFS_ADMIN: 5,
  SWFS_RECRUITER: 4,
  CLIENT_ADMIN: 3,
  HIRING_MANAGER: 2,
  VIEWER: 1,
};

export function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const userLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const minRequired = Math.min(...roles.map((r) => ROLE_HIERARCHY[r] || 0));

    if (userLevel < minRequired) {
      res.status(403).json({ success: false, error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

export function requireOrganizationAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  if (req.user.role === 'SWFS_ADMIN' || req.user.role === 'SWFS_RECRUITER') {
    next();
    return;
  }

  // Clients can only access their own organization
  const requestedOrgId = req.params.organizationId || req.query.organizationId;
  if (requestedOrgId && requestedOrgId !== req.user.organizationId) {
    res.status(403).json({ success: false, error: 'Access denied to this organization' });
    return;
  }

  next();
}
