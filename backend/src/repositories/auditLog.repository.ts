import { auditLogs, addAuditLog } from '../data/mockStore';

export const auditLogRepository = {
  create: async (data: any) => addAuditLog(data),

  findByOrganization: async (organizationId: string, limit = 50) =>
    auditLogs.filter((l) => l.organizationId === organizationId).slice(0, limit),

  findByUser: async (userId: string, limit = 50) =>
    auditLogs.filter((l) => l.userId === userId).slice(0, limit),
};
