import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, UserRole } from '../types';

// Two groups only: ADMIN (SWFS staff) outranks CLIENT (client-org users).
const ROLE_HIERARCHY: Record<UserRole, number> = {
  ADMIN: 2,
  CLIENT: 1,
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

// Unlike requireRole, this does NOT respect the ADMIN > CLIENT hierarchy — it
// matches the caller's role exactly. Use it for actions that are a client-only
// workflow rather than a minimum permission level (e.g. only the client who
// owns a role should attach its job description).
export function requireExactRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    if (!roles.includes(req.user.role)) {
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

  if (req.user.role === 'ADMIN') {
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
