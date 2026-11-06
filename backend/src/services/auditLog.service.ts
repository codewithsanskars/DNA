import { auditLogRepository } from '../repositories/auditLog.repository';
import { JwtPayload } from '../types';
import { notificationService } from './notification.service';

export const auditLogService = {
  log: async (
    user: JwtPayload,
    action: string,
    entityType: string,
    entityId: string,
    details: Record<string, unknown> = {},
    ipAddress?: string
  ) => {
    // The audit row is a record of the action, not part of it: if writing it
    // fails, the user's action (download, shortlist…) must still succeed.
    let log = null;
    try {
      log = await auditLogRepository.create({
        userId: user.userId,
        userEmail: user.email,
        organizationId: user.organizationId,
        action,
        entityType,
        entityId,
        details,
        ipAddress,
      });
    } catch (err) {
      console.warn(`[Audit] Could not record ${action} on ${entityType} ${entityId}: ${(err as Error).message}`);
    }
    // Fan out notifications without making the request wait on them.
    void notificationService.dispatch(user, action, entityType, entityId, details);
    return log;
  },

  getOrganizationActivity: async (organizationId: string, limit = 50) => {
    return auditLogRepository.findByOrganization(organizationId, limit);
  },

  getActivityPage: async (organizationId: string | null, page: number, pageSize: number) =>
    auditLogRepository.findPage(organizationId, page, pageSize),

  // SWFS admin/recruiter view: activity across every client.
  getAllActivity: async (limit = 50) => {
    return auditLogRepository.findAll(limit);
  },
};
