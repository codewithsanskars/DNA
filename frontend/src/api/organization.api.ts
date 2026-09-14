import api from './axios';
import { ApiResponse, CreateOrganizationInput, Organization, ScrapedOrganization } from '../types';

export const organizationApi = {
  getProfile: async (): Promise<Organization> => {
    const res = await api.get<ApiResponse<Organization>>('/organization');
    return res.data.data!;
  },

  getOrganizations: async (): Promise<Organization[]> => {
    const res = await api.get<ApiResponse<Organization[]>>('/organization/list');
    return res.data.data!;
  },

  getOrganization: async (id: string): Promise<Organization> => {
    const res = await api.get<ApiResponse<Organization>>(`/organization/${id}`);
    return res.data.data!;
  },

  /** Fetches a company's page server-side and pulls out fields to prefill the "New organization" form. */
  scrapeCompanyPage: async (url: string): Promise<ScrapedOrganization> => {
    const res = await api.post<ApiResponse<ScrapedOrganization>>('/organization/scrape', { url });
    return res.data.data!;
  },

  createOrganization: async (input: CreateOrganizationInput): Promise<Organization> => {
    const res = await api.post<ApiResponse<Organization>>('/organization', input);
    return res.data.data!;
  },
};
