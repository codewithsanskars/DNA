import { DeepPartial } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { Organization, OrganizationContact } from '../entities';

const repo = () => AppDataSource.getRepository(Organization);
const contactRepo = () => AppDataSource.getRepository(OrganizationContact);

function toDto(org: Organization) {
  return {
    ...org,
    _id: org.id,
    contacts: (org.contacts || [])
      .map((c) => ({
        id: c.id,
        name: c.name,
        title: c.title,
        email: c.email,
        phone: c.phone,
        linkedinUrl: c.linkedinUrl,
        isDecisionMaker: c.isDecisionMaker,
        isHiringManager: c.isHiringManager,
        notes: c.notes,
      }))
      .sort((a, b) => Number(b.isDecisionMaker) - Number(a.isDecisionMaker) || a.name.localeCompare(b.name)),
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

  findContact: async (organizationId: string, contactId: string) =>
    contactRepo().findOne({ where: { id: contactId, organization: { id: organizationId } } }),

  createContact: async (organizationId: string, data: Partial<OrganizationContact>) => {
    await contactRepo().save(contactRepo().create({ ...data, organization: { id: organizationId } as Organization }));
    return organizationRepository.findById(organizationId);
  },

  updateContact: async (organizationId: string, contactId: string, data: Partial<OrganizationContact>) => {
    if (Object.keys(data).length) await contactRepo().update({ id: contactId }, data);
    return organizationRepository.findById(organizationId);
  },

  deleteContact: async (organizationId: string, contactId: string) => {
    await contactRepo().delete({ id: contactId });
    return organizationRepository.findById(organizationId);
  },
};
