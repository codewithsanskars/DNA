import { mockUsers, mockOrganizationUsers } from '../data/mockStore';

let userCounter = mockUsers.length;

export const userRepository = {
  findById: async (id: string) =>
    mockUsers.find((u) => u._id === id || u.id === id) || null,

  findByEmail: async (email: string) =>
    mockUsers.find((u) => u.email === email.toLowerCase() && u.isActive) || null,

  findByOktaId: async (_oktaId: string) => null,

  create: async (data: any) => {
    const user = { ...data, _id: `user_${++userCounter}`, id: `user_${userCounter}`, isActive: true };
    mockUsers.push(user as any);
    return user;
  },

  update: async (id: string, data: any) => {
    const user = mockUsers.find((u) => u._id === id);
    if (user) Object.assign(user, data);
    return user || null;
  },

  findOrganizationsForUser: async (userId: string) =>
    mockOrganizationUsers.filter((ou) => ou.userId === userId && ou.isActive),

  findUsersInOrganization: async (organizationId: string) =>
    mockOrganizationUsers.filter((ou) => ou.organizationId === organizationId && ou.isActive),

  addToOrganization: async (data: any) => {
    const existing = mockOrganizationUsers.find(
      (ou) => ou.organizationId === data.organizationId && ou.userId === data.userId
    );
    if (existing) return { ...existing, ...data };
    mockOrganizationUsers.push(data);
    return data;
  },

  updateLastLogin: async (id: string) => {
    const user = mockUsers.find((u) => u._id === id);
    if (user) (user as any).lastLoginAt = new Date();
    return user || null;
  },
};
