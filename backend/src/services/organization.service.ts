import { attioClient } from '../integrations/attio.client';
import { organizationRepository } from '../repositories/organization.repository';

export const organizationService = {
  getOrganizationProfile: async (organizationId: string) => {
    const org = await organizationRepository.findById(organizationId);
    const attioData = await attioClient.getOrganization(org?.slug || organizationId);
    return { ...org, attio: attioData };
  },

  getOrganizationById: async (id: string) => {
    return organizationRepository.findById(id);
  },

  getAllOrganizationProfiles: async () => {
    const orgs = await organizationRepository.findAll();
    return Promise.all(
      orgs.map(async (org) => {
        const attioData = await attioClient.getOrganization(org.slug);
        return { ...org, attio: attioData };
      })
    );
  },
};
