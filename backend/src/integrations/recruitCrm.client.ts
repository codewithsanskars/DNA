/**
 * Recruit CRM Integration Client (STUB)
 * Replace with real Recruit CRM API calls when credentials are available.
 * All data access to Recruit CRM MUST go through this layer — never expose API keys to the frontend.
 */

import { env } from '../config/env';

const MOCK_JOBS: Record<string, any[]> = {
  org_techcorp: [
    {
      id: 'job_001',
      title: 'Senior Software Engineer',
      department: 'Engineering',
      location: 'Remote (US)',
      status: 'OPEN',
      openedAt: '2024-11-01',
      totalCandidates: 5,
    },
    {
      id: 'job_002',
      title: 'Frontend Developer',
      department: 'Engineering',
      location: 'New York, NY',
      status: 'OPEN',
      openedAt: '2024-11-15',
      totalCandidates: 3,
    },
    {
      id: 'job_003',
      title: 'DevOps Engineer',
      department: 'Infrastructure',
      location: 'Austin, TX',
      status: 'CLOSED',
      openedAt: '2024-10-01',
      totalCandidates: 2,
    },
  ],
  org_financegroup: [
    {
      id: 'job_004',
      title: 'Chief Financial Officer',
      department: 'Finance',
      location: 'Chicago, IL',
      status: 'OPEN',
      openedAt: '2024-11-10',
      totalCandidates: 3,
    },
    {
      id: 'job_005',
      title: 'Financial Analyst',
      department: 'Finance',
      location: 'Chicago, IL',
      status: 'OPEN',
      openedAt: '2024-11-20',
      totalCandidates: 2,
    },
  ],
};

const MOCK_CANDIDATES: Record<string, any[]> = {
  job_001: [
    {
      id: 'cand_001',
      firstName: 'Alex',
      lastName: 'Chen',
      email: 'alex.chen@example.com',
      phone: '+1-555-0101',
      currentTitle: 'Software Engineer',
      currentCompany: 'StartupXYZ',
      location: 'San Francisco, CA',
      stage: 'INTERVIEW',
      skills: ['TypeScript', 'React', 'Node.js', 'AWS'],
      linkedinUrl: 'https://linkedin.com/in/alex-chen',
    },
    {
      id: 'cand_002',
      firstName: 'Maria',
      lastName: 'Rodriguez',
      email: 'maria.r@example.com',
      phone: '+1-555-0102',
      currentTitle: 'Lead Engineer',
      currentCompany: 'BigTech Corp',
      location: 'Seattle, WA',
      stage: 'SHORTLISTED',
      skills: ['Go', 'Kubernetes', 'Docker', 'Python'],
      linkedinUrl: 'https://linkedin.com/in/maria-rodriguez',
    },
    {
      id: 'cand_003',
      firstName: 'James',
      lastName: 'Wilson',
      email: 'james.w@example.com',
      phone: '+1-555-0103',
      currentTitle: 'Full Stack Developer',
      currentCompany: 'Agency Inc',
      location: 'New York, NY',
      stage: 'SCREENING',
      skills: ['JavaScript', 'Vue.js', 'PostgreSQL'],
      linkedinUrl: 'https://linkedin.com/in/james-wilson',
    },
    {
      id: 'cand_004',
      firstName: 'Priya',
      lastName: 'Patel',
      email: 'priya.p@example.com',
      phone: '+1-555-0104',
      currentTitle: 'Backend Engineer',
      currentCompany: 'FinTech Ltd',
      location: 'Austin, TX',
      stage: 'APPLIED',
      skills: ['Java', 'Spring Boot', 'MySQL', 'Kafka'],
      linkedinUrl: 'https://linkedin.com/in/priya-patel',
    },
    {
      id: 'cand_005',
      firstName: 'David',
      lastName: 'Kim',
      email: 'david.k@example.com',
      phone: '+1-555-0105',
      currentTitle: 'Senior Developer',
      currentCompany: 'Consulting Co',
      location: 'Boston, MA',
      stage: 'REJECTED',
      skills: ['Ruby on Rails', 'React', 'Redis'],
      linkedinUrl: 'https://linkedin.com/in/david-kim',
    },
  ],
  job_002: [
    {
      id: 'cand_006',
      firstName: 'Emma',
      lastName: 'Thompson',
      email: 'emma.t@example.com',
      phone: '+1-555-0106',
      currentTitle: 'UI Developer',
      currentCompany: 'Design Studio',
      location: 'New York, NY',
      stage: 'INTERVIEW',
      skills: ['React', 'TypeScript', 'CSS', 'Figma'],
      linkedinUrl: 'https://linkedin.com/in/emma-thompson',
    },
    {
      id: 'cand_007',
      firstName: 'Carlos',
      lastName: 'Santos',
      email: 'carlos.s@example.com',
      phone: '+1-555-0107',
      currentTitle: 'Frontend Engineer',
      currentCompany: 'E-commerce Co',
      location: 'Miami, FL',
      stage: 'SCREENING',
      skills: ['Next.js', 'GraphQL', 'Tailwind CSS'],
      linkedinUrl: 'https://linkedin.com/in/carlos-santos',
    },
    {
      id: 'cand_008',
      firstName: 'Sophie',
      lastName: 'Martin',
      email: 'sophie.m@example.com',
      phone: '+1-555-0108',
      currentTitle: 'React Developer',
      currentCompany: 'SaaS Platform',
      location: 'Los Angeles, CA',
      stage: 'SHORTLISTED',
      skills: ['React', 'Redux', 'Testing Library', 'Storybook'],
      linkedinUrl: 'https://linkedin.com/in/sophie-martin',
    },
  ],
  job_003: [
    {
      id: 'cand_009',
      firstName: 'Ryan',
      lastName: 'Brooks',
      email: 'ryan.b@example.com',
      phone: '+1-555-0109',
      currentTitle: 'DevOps Lead',
      currentCompany: 'Cloud Corp',
      location: 'Austin, TX',
      stage: 'HIRED',
      skills: ['Terraform', 'AWS', 'CI/CD', 'Kubernetes'],
      linkedinUrl: 'https://linkedin.com/in/ryan-brooks',
    },
  ],
  job_004: [
    {
      id: 'cand_010',
      firstName: 'Linda',
      lastName: 'Foster',
      email: 'linda.f@example.com',
      phone: '+1-555-0110',
      currentTitle: 'VP of Finance',
      currentCompany: 'Investment Group',
      location: 'Chicago, IL',
      stage: 'OFFER',
      skills: ['Financial Planning', 'M&A', 'Board Reporting', 'FP&A'],
      linkedinUrl: 'https://linkedin.com/in/linda-foster',
    },
    {
      id: 'cand_011',
      firstName: 'Robert',
      lastName: 'Davis',
      email: 'robert.d@example.com',
      phone: '+1-555-0111',
      currentTitle: 'CFO',
      currentCompany: 'Regional Bank',
      location: 'Detroit, MI',
      stage: 'INTERVIEW',
      skills: ['GAAP', 'SOX Compliance', 'Treasury', 'Risk Management'],
      linkedinUrl: 'https://linkedin.com/in/robert-davis',
    },
    {
      id: 'cand_012',
      firstName: 'Nancy',
      lastName: 'Lee',
      email: 'nancy.l@example.com',
      phone: '+1-555-0112',
      currentTitle: 'Finance Director',
      currentCompany: 'Healthcare Inc',
      location: 'Chicago, IL',
      stage: 'SCREENING',
      skills: ['Financial Modeling', 'ERP Systems', 'Budget Management'],
      linkedinUrl: 'https://linkedin.com/in/nancy-lee',
    },
  ],
  job_005: [
    {
      id: 'cand_013',
      firstName: 'Kevin',
      lastName: 'Zhang',
      email: 'kevin.z@example.com',
      phone: '+1-555-0113',
      currentTitle: 'Senior Analyst',
      currentCompany: 'Consulting Firm',
      location: 'Chicago, IL',
      stage: 'SHORTLISTED',
      skills: ['Excel', 'SQL', 'Power BI', 'Python'],
      linkedinUrl: 'https://linkedin.com/in/kevin-zhang',
    },
    {
      id: 'cand_014',
      firstName: 'Aisha',
      lastName: 'Johnson',
      email: 'aisha.j@example.com',
      phone: '+1-555-0114',
      currentTitle: 'Financial Analyst',
      currentCompany: 'Asset Management',
      location: 'New York, NY',
      stage: 'APPLIED',
      skills: ['Financial Analysis', 'Tableau', 'Bloomberg Terminal'],
      linkedinUrl: 'https://linkedin.com/in/aisha-johnson',
    },
  ],
};

export const recruitCrmClient = {
  getJobs: async (organizationId: string): Promise<any[]> => {
    // STUB: Replace with real API call
    // const response = await axios.get(`${env.recruitCrm.baseUrl}/jobs`, {
    //   headers: { Authorization: `Bearer ${env.recruitCrm.apiKey}` },
    //   params: { company_id: organizationId }
    // });
    return MOCK_JOBS[organizationId] || [];
  },

  getJob: async (jobId: string): Promise<any | null> => {
    // STUB: Replace with real API call
    for (const jobs of Object.values(MOCK_JOBS)) {
      const job = jobs.find((j) => j.id === jobId);
      if (job) return job;
    }
    return null;
  },

  getCandidatesForJob: async (jobId: string): Promise<any[]> => {
    // STUB: Replace with real API call
    return MOCK_CANDIDATES[jobId] || [];
  },

  updateCandidateStage: async (candidateId: string, stage: string): Promise<boolean> => {
    // STUB: Replace with real API call
    console.log(`[RecruitCRM STUB] updateCandidateStage: candidate=${candidateId} stage=${stage}`);
    return true;
  },

  submitFeedback: async (candidateId: string, feedback: string, rating?: number): Promise<boolean> => {
    // STUB: Replace with real API call
    console.log(`[RecruitCRM STUB] submitFeedback: candidate=${candidateId}`);
    return true;
  },

  requestInterview: async (candidateId: string, requestData: any): Promise<boolean> => {
    // STUB: Replace with real API call
    console.log(`[RecruitCRM STUB] requestInterview: candidate=${candidateId}`);
    return true;
  },
};
