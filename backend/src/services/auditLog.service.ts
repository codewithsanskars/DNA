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
    const log = await auditLogRepository.create({
      userId: user.userId,
      userEmail: user.email,
      organizationId: user.organizationId,
      action,
      entityType,
      entityId,
      details,
      ipAddress,
    });
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
