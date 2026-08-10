import { mockOrganizations } from '../data/mockStore';

export const organizationRepository = {
  findById: async (id: string) =>
    mockOrganizations.find((o) => o._id === id || o.id === id) || null,

  findBySlug: async (slug: string) =>
    mockOrganizations.find((o) => o.slug === slug && o.isActive) || null,

  findAll: async () => [...mockOrganizations].sort((a, b) => a.name.localeCompare(b.name)),

  create: async (data: any) => ({ ...data, _id: data.slug, id: data.slug }),

  update: async (id: string, data: any) => {
    const org = mockOrganizations.find((o) => o._id === id);
    return org ? { ...org, ...data } : null;
  },
};
