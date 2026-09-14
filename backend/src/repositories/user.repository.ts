import { AppDataSource } from '../config/data-source';
import { User, OrganizationMembership } from '../entities';

const users = () => AppDataSource.getRepository(User);
const memberships = () => AppDataSource.getRepository(OrganizationMembership);

function toDto(user: User) {
  return { ...user, _id: user.id };
}

export const userRepository = {
  findById: async (id: string) => {
    const user = await users().findOne({ where: { id } });
    return user ? toDto(user) : null;
  },

  findByEmail: async (email: string) => {
    const user = await users().findOne({ where: { email: email.toLowerCase(), isActive: true } });
    return user ? toDto(user) : null;
  },

  findByOktaId: async (oktaId: string) => {
    const user = await users().findOne({ where: { oktaId } });
    return user ? toDto(user) : null;
  },

  create: async (data: { email: string; name: string }) => {
    const user = await users().save(users().create({ email: data.email, name: data.name }));
    return toDto(user);
  },

  update: async (id: string, data: any) => {
    await users().update(id, data);
    return userRepository.findById(id);
  },

  // Every active organization/role pair this user belongs to.
  findOrganizationsForUser: async (userId: string) => {
    const rows = await memberships().find({
      where: { user: { id: userId }, isActive: true },
      relations: ['organization'],
    });
    return rows.map((m) => ({
      organizationId: m.organization.id,
      userId,
      role: m.role,
      isActive: m.isActive,
    }));
  },

  findUsersInOrganization: async (organizationId: string) => {
    const rows = await memberships().find({
      where: { organization: { id: organizationId }, isActive: true },
      relations: ['user'],
    });
    return rows.map((m) => ({
      organizationId,
      userId: m.user.id,
      role: m.role,
      isActive: m.isActive,
    }));
  },

  // Upserts the (user, organization) membership — used both by admin flows and
  // to auto-provision demo/prototype logins.
  addToOrganization: async (data: { organizationId: string; userId: string; role: string }) => {
    const existing = await memberships().findOne({
      where: { organization: { id: data.organizationId }, user: { id: data.userId } },
    });
    const saved = await memberships().save(
      memberships().create({
        ...(existing ? { id: existing.id } : {}),
        organization: { id: data.organizationId } as any,
        user: { id: data.userId } as any,
        role: data.role as any,
        isActive: true,
      })
    );
    return { organizationId: data.organizationId, userId: data.userId, role: saved.role, isActive: saved.isActive };
  },

  updateLastLogin: async (id: string) => {
    await users().update(id, { lastLoginAt: new Date() });
    return userRepository.findById(id);
  },
};
