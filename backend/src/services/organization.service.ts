import { organizationRepository } from '../repositories/organization.repository';
import { scrapeService, ScrapedOrganization } from './scrape.service';
import { OrganizationContact } from '../entities';
import { notFound } from '../utils/http';

export interface CreateOrganizationInput {
  name: string;
  industry?: string;
  website?: string;
  logoUrl?: string;
  email?: string;
  description?: string;
  hq?: string;
  employeeCount?: number;
  founded?: string;
  socialLinks?: { linkedin?: string; twitter?: string; facebook?: string; instagram?: string };
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return base || 'org';
}

async function generateUniqueSlug(name: string): Promise<string> {
  const stem = `org_${slugify(name)}`;
  if (!(await organizationRepository.slugTaken(stem))) return stem;
  for (let suffix = 2; suffix < 1000; suffix++) {
    const candidate = `${stem}_${suffix}`;
    if (!(await organizationRepository.slugTaken(candidate))) return candidate;
  }
  // Astronomically unlikely, but keep this total rather than throwing.
  return `${stem}_${Date.now()}`;
}

export const organizationService = {
  getOrganizationProfile: async (organizationId: string) => {
    return organizationRepository.findById(organizationId);
  },

  getOrganizationById: async (id: string) => {
    return organizationRepository.findById(id);
  },

  getAllOrganizationProfiles: async () => {
    return organizationRepository.findAll();
  },

  createOrganization: async (input: CreateOrganizationInput) => {
    const slug = await generateUniqueSlug(input.name);
    return organizationRepository.create({ ...input, slug });
  },

  /** Fetches a company's public page and extracts fields for the "add organization" form to prefill. */
  scrapeCompanyPage: async (url: string): Promise<ScrapedOrganization> => {
    return scrapeService.scrapeCompanyPage(url);
  },

  /** Admin edit of a client's profile (RC-18). The slug never changes. */
  updateOrganization: async (id: string, input: Partial<CreateOrganizationInput>) => {
    const org = await organizationRepository.findById(id);
    if (!org) throw notFound('Organization not found');
    return organizationRepository.update(id, input);
  },

  // ---- Contacts (RC-83 / RC-84) ---------------------------------------------

  addContact: async (organizationId: string, data: Partial<OrganizationContact>) => {
    if (!(await organizationRepository.findById(organizationId))) throw notFound('Organization not found');
    return organizationRepository.createContact(organizationId, data);
  },

  updateContact: async (organizationId: string, contactId: string, data: Partial<OrganizationContact>) => {
    if (!(await organizationRepository.findContact(organizationId, contactId))) throw notFound('Contact not found');
    return organizationRepository.updateContact(organizationId, contactId, data);
  },

  deleteContact: async (organizationId: string, contactId: string) => {
    if (!(await organizationRepository.findContact(organizationId, contactId))) throw notFound('Contact not found');
    return organizationRepository.deleteContact(organizationId, contactId);
  },
};
