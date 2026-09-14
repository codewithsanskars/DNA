import { auditLogRepository } from '../repositories/auditLog.repository';
import { JwtPayload } from '../types';

export const auditLogService = {
  log: async (
    user: JwtPayload,
    action: string,
    entityType: string,
    entityId: string,
    details: Record<string, unknown> = {},
    ipAddress?: string
  ) => {
    return auditLogRepository.create({
      userId: user.userId,
      userEmail: user.email,
      organizationId: user.organizationId,
      action,
      entityType,
      entityId,
      details,
      ipAddress,
    });
  },

  getOrganizationActivity: async (organizationId: string, limit = 50) => {
    return auditLogRepository.findByOrganization(organizationId, limit);
  },

  // SWFS admin/recruiter view: activity across every client.
  getAllActivity: async (limit = 50) => {
    return auditLogRepository.findAll(limit);
  },
};
