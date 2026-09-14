import { organizationRepository } from '../repositories/organization.repository';
import { scrapeService, ScrapedOrganization } from './scrape.service';

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
};
