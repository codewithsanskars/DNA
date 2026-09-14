import { AppDataSource } from '../config/data-source';
import { AuditLog } from '../entities';

const repo = () => AppDataSource.getRepository(AuditLog);

function toDto(log: AuditLog) {
  return {
    _id: log.id,
    id: log.id,
    userId: log.userId,
    userEmail: log.userEmail,
    organizationId: log.organization?.id ?? null,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    details: log.details,
    ipAddress: log.ipAddress,
    createdAt: log.createdAt,
  };
}

export const auditLogRepository = {
  create: async (data: {
    userId?: string;
    userEmail: string;
    organizationId?: string;
    action: string;
    entityType: string;
    entityId: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
  }) => {
    const { organizationId, ...rest } = data;
    const log = await repo().save(
      repo().create({ ...rest, organization: organizationId ? ({ id: organizationId } as any) : null })
    );
    return toDto(log);
  },

  findByOrganization: async (organizationId: string, limit = 50) => {
    const logs = await repo().find({
      where: { organization: { id: organizationId } },
      relations: ['organization'],
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return logs.map(toDto);
  },

  findAll: async (limit = 50) => {
    const logs = await repo().find({
      relations: ['organization'],
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return logs.map(toDto);
  },

  findByUser: async (userId: string, limit = 50) => {
    const logs = await repo().find({
      where: { userId },
      relations: ['organization'],
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return logs.map(toDto);
  },
};
