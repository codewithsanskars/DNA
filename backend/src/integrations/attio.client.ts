/**
 * Attio CRM Integration Client (STUB)
 * Replace with real Attio API calls when credentials are available.
 * Provides organization context — does NOT manage recruiting workflows.
 */

const MOCK_ORGANIZATIONS: Record<string, any> = {
  org_techcorp: {
    id: 'org_techcorp',
    name: 'TechCorp Inc',
    industry: 'Technology',
    website: 'https://techcorp.example.com',
    email: 'partnerships@techcorp.example.com',
    socialLinks: {
      linkedin: 'https://linkedin.com/company/techcorp',
      twitter: 'https://twitter.com/techcorp',
      facebook: 'https://facebook.com/techcorp',
    },
    employeeCount: 250,
    founded: '2015',
    hq: 'San Francisco, CA',
    description: 'A leading technology company focused on cloud-native software solutions.',
    contacts: [
      { name: 'Sarah Chen', title: 'Head of Talent', email: 'sarah.chen@techcorp.example.com' },
      { name: 'Mark Johnson', title: 'CTO', email: 'mark.johnson@techcorp.example.com' },
    ],
    recentActivity: [
      { type: 'note', content: 'Discussed Q4 hiring expansion plans', date: '2024-11-28' },
      { type: 'meeting', content: 'Quarterly business review', date: '2024-11-15' },
    ],
  },
  org_financegroup: {
    id: 'org_financegroup',
    name: 'FinanceGroup LLC',
    industry: 'Financial Services',
    website: 'https://financegroup.example.com',
    email: 'partnerships@financegroup.example.com',
    socialLinks: {
      linkedin: 'https://linkedin.com/company/financegroup',
      twitter: 'https://twitter.com/financegroup',
      facebook: 'https://facebook.com/financegroup',
    },
    employeeCount: 120,
    founded: '2010',
    hq: 'Chicago, IL',
    description: 'A boutique financial services firm specializing in investment management and advisory.',
    contacts: [
      { name: 'Jennifer Walsh', title: 'HR Director', email: 'j.walsh@financegroup.example.com' },
      { name: 'Patrick Moore', title: 'CEO', email: 'p.moore@financegroup.example.com' },
    ],
    recentActivity: [
      { type: 'note', content: 'Expanding finance team for Q1 2025', date: '2024-11-25' },
      { type: 'meeting', content: 'Role briefing — CFO search kickoff', date: '2024-11-10' },
    ],
  },
};

export const attioClient = {
  getOrganization: async (organizationId: string): Promise<any | null> => {
    // STUB: Replace with real Attio API call
    // const response = await axios.get(`${env.attio.baseUrl}/objects/companies/${attioId}`, {
    //   headers: { Authorization: `Bearer ${env.attio.apiKey}` }
    // });
    return MOCK_ORGANIZATIONS[organizationId] || null;
  },

  getContacts: async (organizationId: string): Promise<any[]> => {
    // STUB: Replace with real Attio API call
    return MOCK_ORGANIZATIONS[organizationId]?.contacts || [];
  },

  addActivityNote: async (organizationId: string, note: string): Promise<boolean> => {
    // STUB: Replace with real Attio API call
    console.log(`[Attio STUB] addActivityNote: org=${organizationId}`);
    return true;
  },
};
