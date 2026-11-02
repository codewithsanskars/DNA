import { In, IsNull, LessThan } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { Notification, OrganizationMembership, User } from '../entities';

const repo = () => AppDataSource.getRepository(Notification);
const memberships = () => AppDataSource.getRepository(OrganizationMembership);
const users = () => AppDataSource.getRepository(User);

function toDto(n: Notification) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body ?? undefined,
    link: n.link ?? undefined,
    actorName: n.actorName ?? undefined,
    readAt: n.readAt ?? undefined,
    createdAt: n.createdAt,
  };
}

export interface NewNotification {
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  actorName?: string | null;
}

export const notificationRepository = {
  createForUsers: async (userIds: string[], n: NewNotification) => {
    const unique = [...new Set(userIds)];
    if (!unique.length) return;
    await repo().save(unique.map((id) => repo().create({ ...n, recipient: { id } as User })));
  },

  listForUser: async (userId: string, opts: { unreadOnly?: boolean; limit?: number; before?: Date }) => {
    const where: Record<string, unknown> = { recipient: { id: userId } };
    if (opts.unreadOnly) where.readAt = IsNull();
    if (opts.before) where.createdAt = LessThan(opts.before);
    const rows = await repo().find({ where, order: { createdAt: 'DESC' }, take: Math.min(opts.limit ?? 30, 100) });
    return rows.map(toDto);
  },

  unreadCount: (userId: string) => repo().count({ where: { recipient: { id: userId }, readAt: IsNull() } }),

  markRead: async (userId: string, ids: string[]) => {
    if (!ids.length) return;
    // Scoped to the recipient so nobody can mark someone else's notifications.
    await repo().update({ id: In(ids), recipient: { id: userId }, readAt: IsNull() }, { readAt: new Date() });
  },

  markAllRead: async (userId: string) => {
    await repo().update({ recipient: { id: userId }, readAt: IsNull() }, { readAt: new Date() });
  },

  /** Housekeeping: read notifications older than the cutoff. */
  purgeReadBefore: async (cutoff: Date) => {
    await repo()
      .createQueryBuilder()
      .delete()
      .where('"readAt" IS NOT NULL AND "createdAt" < :cutoff', { cutoff })
      .execute();
  },

  // ---- recipient lookups ------------------------------------------------------

  /** Active SWFS staff (ADMIN members). */
  staffIds: async () => {
    const rows = await memberships().find({ where: { role: 'ADMIN', isActive: true }, relations: ['user'] });
    return [...new Set(rows.filter((m) => m.user?.isActive).map((m) => m.user.id))];
  },

  /** Active CLIENT users of one organization. */
  clientIds: async (organizationId: string) => {
    const rows = await memberships().find({
      where: { organization: { id: organizationId }, role: 'CLIENT', isActive: true },
      relations: ['user'],
    });
    return [...new Set(rows.filter((m) => m.user?.isActive).map((m) => m.user.id))];
  },

  userName: async (userId: string) => (await users().findOne({ where: { id: userId }, select: ['id', 'name'] }))?.name ?? null,

  userIdsByEmail: async (emails: string[]) => {
    const list = [...new Set(emails.filter(Boolean).map((e) => e.toLowerCase()))];
    if (!list.length) return [];
    const rows = await users().find({ where: { email: In(list) }, select: ['id'] });
    return rows.map((u) => u.id);
  },
};
