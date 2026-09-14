import { DeepPartial } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { Organization } from '../entities';

const repo = () => AppDataSource.getRepository(Organization);

function toDto(org: Organization) {
  return {
    ...org,
    _id: org.id,
    contacts: (org.contacts || []).map((c) => ({ name: c.name, title: c.title, email: c.email })),
  };
}

export const organizationRepository = {
  findById: async (id: string) => {
    const org = await repo().findOne({ where: { id }, relations: ['contacts'] });
    return org ? toDto(org) : null;
  },

  findBySlug: async (slug: string) => {
    const org = await repo().findOne({ where: { slug, isActive: true }, relations: ['contacts'] });
    return org ? toDto(org) : null;
  },

  findAll: async () => {
    const orgs = await repo().find({ relations: ['contacts'], order: { name: 'ASC' } });
    return orgs.map(toDto);
  },

  create: async (data: DeepPartial<Organization>) => {
    const org = await repo().save(repo().create(data));
    return toDto(org);
  },

  /** Includes inactive rows too — a slug must be unique regardless of status. */
  slugTaken: async (slug: string) => {
    return (await repo().count({ where: { slug } })) > 0;
  },

  update: async (id: string, data: any) => {
    await repo().update(id, data);
    return organizationRepository.findById(id);
  },
};
