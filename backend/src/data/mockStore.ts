/**
 * In-memory mock store — replaces MongoDB for the prototype.
 * Swap repositories back to Mongoose versions when the DB is ready.
 */

export const mockOrganizations = [
  {
    _id: 'org_techcorp',
    id: 'org_techcorp',
    name: 'TechCorp Inc',
    slug: 'org_techcorp',
    industry: 'Technology',
    website: 'https://techcorp.example.com',
    isActive: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    toObject() { return { ...this }; },
  },
  {
    _id: 'org_financegroup',
    id: 'org_financegroup',
    name: 'FinanceGroup LLC',
    slug: 'org_financegroup',
    industry: 'Financial Services',
    website: 'https://financegroup.example.com',
    isActive: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    toObject() { return { ...this }; },
  },
];

export const mockUsers = [
  { _id: 'user_swfs_admin', id: 'user_swfs_admin', email: 'admin@swfs.ai', name: 'SWFS Admin', role: 'SWFS_ADMIN', isActive: true, lastLoginAt: null },
  { _id: 'user_tc_admin', id: 'user_tc_admin', email: 'client.admin@techcorp.com', name: 'Sarah Chen', role: 'CLIENT_ADMIN', isActive: true, lastLoginAt: null },
  { _id: 'user_tc_hiring', id: 'user_tc_hiring', email: 'hiring@techcorp.com', name: 'Mark Johnson', role: 'HIRING_MANAGER', isActive: true, lastLoginAt: null },
  { _id: 'user_tc_viewer', id: 'user_tc_viewer', email: 'viewer@techcorp.com', name: 'Tom Lee', role: 'VIEWER', isActive: true, lastLoginAt: null },
  { _id: 'user_fg_admin', id: 'user_fg_admin', email: 'client.admin@financegroup.com', name: 'Jennifer Walsh', role: 'CLIENT_ADMIN', isActive: true, lastLoginAt: null },
  { _id: 'user_fg_hiring', id: 'user_fg_hiring', email: 'hiring@financegroup.com', name: 'Patrick Moore', role: 'HIRING_MANAGER', isActive: true, lastLoginAt: null },
];

export const mockOrganizationUsers = [
  { organizationId: 'org_techcorp', userId: 'user_swfs_admin', role: 'SWFS_ADMIN', isActive: true },
  { organizationId: 'org_techcorp', userId: 'user_tc_admin', role: 'CLIENT_ADMIN', isActive: true },
  { organizationId: 'org_techcorp', userId: 'user_tc_hiring', role: 'HIRING_MANAGER', isActive: true },
  { organizationId: 'org_techcorp', userId: 'user_tc_viewer', role: 'VIEWER', isActive: true },
  { organizationId: 'org_financegroup', userId: 'user_fg_admin', role: 'CLIENT_ADMIN', isActive: true },
  { organizationId: 'org_financegroup', userId: 'user_fg_hiring', role: 'HIRING_MANAGER', isActive: true },
];

export const mockJobs = [
  { _id: 'job_001', id: 'job_001', recruitCrmId: 'job_001', organizationId: 'org_techcorp', title: 'Senior Software Engineer', department: 'Engineering', location: 'Remote (US)', status: 'OPEN', totalCandidates: 5, openedAt: new Date('2024-11-01'), syncedAt: new Date(), description: 'Own the design and delivery of core backend services for our cloud platform, mentoring mid-level engineers along the way.', payRate: '$70 - $85/hr', billableHours: '40 hrs/week', workType: 'CONTRACT_TO_HIRE', payrollType: 'THIRD_PARTY' },
  { _id: 'job_002', id: 'job_002', recruitCrmId: 'job_002', organizationId: 'org_techcorp', title: 'Frontend Developer', department: 'Engineering', location: 'New York, NY', status: 'OPEN', totalCandidates: 3, openedAt: new Date('2024-11-15'), syncedAt: new Date(), description: 'Build and maintain customer-facing React interfaces in close collaboration with product and design.', payRate: '$55 - $65/hr', billableHours: '40 hrs/week', workType: 'FULL_TIME', payrollType: 'IN_HOUSE' },
  { _id: 'job_003', id: 'job_003', recruitCrmId: 'job_003', organizationId: 'org_techcorp', title: 'DevOps Engineer', department: 'Infrastructure', location: 'Austin, TX', status: 'CLOSED', totalCandidates: 1, openedAt: new Date('2024-10-01'), syncedAt: new Date(), description: 'Manage CI/CD pipelines and cloud infrastructure across staging and production environments.', payRate: '$75 - $90/hr', billableHours: '35 hrs/week', workType: 'CONTRACT', payrollType: 'THIRD_PARTY' },
  { _id: 'job_004', id: 'job_004', recruitCrmId: 'job_004', organizationId: 'org_financegroup', title: 'Chief Financial Officer', department: 'Finance', location: 'Chicago, IL', status: 'OPEN', totalCandidates: 3, openedAt: new Date('2024-11-10'), syncedAt: new Date(), description: 'Lead financial strategy, reporting, and treasury operations for a growing investment firm.', payRate: '$220k - $260k/yr', billableHours: '40 hrs/week', workType: 'FULL_TIME', payrollType: 'IN_HOUSE' },
  { _id: 'job_005', id: 'job_005', recruitCrmId: 'job_005', organizationId: 'org_financegroup', title: 'Financial Analyst', department: 'Finance', location: 'Chicago, IL', status: 'OPEN', totalCandidates: 2, openedAt: new Date('2024-11-20'), syncedAt: new Date(), description: 'Support quarterly forecasting, budget variance analysis, and ad hoc financial modeling.', payRate: '$40 - $50/hr', billableHours: '40 hrs/week', workType: 'CONTRACT', payrollType: 'THIRD_PARTY' },
];

export const mockCandidates = [
  { _id: 'cand_001', id: 'cand_001', recruitCrmId: 'cand_001', organizationId: 'org_techcorp', jobId: 'job_001', firstName: 'Alex', lastName: 'Chen', email: 'alex.chen@example.com', phone: '+1-555-0101', currentTitle: 'Software Engineer', currentCompany: 'StartupXYZ', location: 'San Francisco, CA', stage: 'INTERVIEW', skills: ['TypeScript', 'React', 'Node.js', 'AWS'], linkedinUrl: 'https://linkedin.com/in/alex-chen', clientRating: null, syncedAt: new Date() },
  { _id: 'cand_002', id: 'cand_002', recruitCrmId: 'cand_002', organizationId: 'org_techcorp', jobId: 'job_001', firstName: 'Maria', lastName: 'Rodriguez', email: 'maria.r@example.com', phone: '+1-555-0102', currentTitle: 'Lead Engineer', currentCompany: 'BigTech Corp', location: 'Seattle, WA', stage: 'SHORTLISTED', skills: ['Go', 'Kubernetes', 'Docker', 'Python'], linkedinUrl: 'https://linkedin.com/in/maria-rodriguez', clientRating: null, syncedAt: new Date() },
  { _id: 'cand_003', id: 'cand_003', recruitCrmId: 'cand_003', organizationId: 'org_techcorp', jobId: 'job_001', firstName: 'James', lastName: 'Wilson', email: 'james.w@example.com', phone: '+1-555-0103', currentTitle: 'Full Stack Developer', currentCompany: 'Agency Inc', location: 'New York, NY', stage: 'SCREENING', skills: ['JavaScript', 'Vue.js', 'PostgreSQL'], linkedinUrl: 'https://linkedin.com/in/james-wilson', clientRating: null, syncedAt: new Date() },
  { _id: 'cand_004', id: 'cand_004', recruitCrmId: 'cand_004', organizationId: 'org_techcorp', jobId: 'job_001', firstName: 'Priya', lastName: 'Patel', email: 'priya.p@example.com', phone: '+1-555-0104', currentTitle: 'Backend Engineer', currentCompany: 'FinTech Ltd', location: 'Austin, TX', stage: 'APPLIED', skills: ['Java', 'Spring Boot', 'MySQL', 'Kafka'], linkedinUrl: 'https://linkedin.com/in/priya-patel', clientRating: null, syncedAt: new Date() },
  { _id: 'cand_005', id: 'cand_005', recruitCrmId: 'cand_005', organizationId: 'org_techcorp', jobId: 'job_001', firstName: 'David', lastName: 'Kim', email: 'david.k@example.com', phone: '+1-555-0105', currentTitle: 'Senior Developer', currentCompany: 'Consulting Co', location: 'Boston, MA', stage: 'REJECTED', skills: ['Ruby on Rails', 'React', 'Redis'], linkedinUrl: 'https://linkedin.com/in/david-kim', clientRating: null, syncedAt: new Date() },
  { _id: 'cand_006', id: 'cand_006', recruitCrmId: 'cand_006', organizationId: 'org_techcorp', jobId: 'job_002', firstName: 'Emma', lastName: 'Thompson', email: 'emma.t@example.com', phone: '+1-555-0106', currentTitle: 'UI Developer', currentCompany: 'Design Studio', location: 'New York, NY', stage: 'INTERVIEW', skills: ['React', 'TypeScript', 'CSS', 'Figma'], linkedinUrl: 'https://linkedin.com/in/emma-thompson', clientRating: null, syncedAt: new Date() },
  { _id: 'cand_007', id: 'cand_007', recruitCrmId: 'cand_007', organizationId: 'org_techcorp', jobId: 'job_002', firstName: 'Carlos', lastName: 'Santos', email: 'carlos.s@example.com', phone: '+1-555-0107', currentTitle: 'Frontend Engineer', currentCompany: 'E-commerce Co', location: 'Miami, FL', stage: 'SCREENING', skills: ['Next.js', 'GraphQL', 'Tailwind CSS'], linkedinUrl: 'https://linkedin.com/in/carlos-santos', clientRating: null, syncedAt: new Date() },
  { _id: 'cand_008', id: 'cand_008', recruitCrmId: 'cand_008', organizationId: 'org_techcorp', jobId: 'job_002', firstName: 'Sophie', lastName: 'Martin', email: 'sophie.m@example.com', phone: '+1-555-0108', currentTitle: 'React Developer', currentCompany: 'SaaS Platform', location: 'Los Angeles, CA', stage: 'SHORTLISTED', skills: ['React', 'Redux', 'Testing Library', 'Storybook'], linkedinUrl: 'https://linkedin.com/in/sophie-martin', clientRating: null, syncedAt: new Date() },
  { _id: 'cand_009', id: 'cand_009', recruitCrmId: 'cand_009', organizationId: 'org_techcorp', jobId: 'job_003', firstName: 'Ryan', lastName: 'Brooks', email: 'ryan.b@example.com', phone: '+1-555-0109', currentTitle: 'DevOps Lead', currentCompany: 'Cloud Corp', location: 'Austin, TX', stage: 'HIRED', skills: ['Terraform', 'AWS', 'CI/CD', 'Kubernetes'], linkedinUrl: 'https://linkedin.com/in/ryan-brooks', clientRating: null, syncedAt: new Date() },
  { _id: 'cand_010', id: 'cand_010', recruitCrmId: 'cand_010', organizationId: 'org_financegroup', jobId: 'job_004', firstName: 'Linda', lastName: 'Foster', email: 'linda.f@example.com', phone: '+1-555-0110', currentTitle: 'VP of Finance', currentCompany: 'Investment Group', location: 'Chicago, IL', stage: 'OFFER', skills: ['Financial Planning', 'M&A', 'Board Reporting', 'FP&A'], linkedinUrl: 'https://linkedin.com/in/linda-foster', clientRating: null, syncedAt: new Date() },
  { _id: 'cand_011', id: 'cand_011', recruitCrmId: 'cand_011', organizationId: 'org_financegroup', jobId: 'job_004', firstName: 'Robert', lastName: 'Davis', email: 'robert.d@example.com', phone: '+1-555-0111', currentTitle: 'CFO', currentCompany: 'Regional Bank', location: 'Detroit, MI', stage: 'INTERVIEW', skills: ['GAAP', 'SOX Compliance', 'Treasury', 'Risk Management'], linkedinUrl: 'https://linkedin.com/in/robert-davis', clientRating: null, syncedAt: new Date() },
  { _id: 'cand_012', id: 'cand_012', recruitCrmId: 'cand_012', organizationId: 'org_financegroup', jobId: 'job_004', firstName: 'Nancy', lastName: 'Lee', email: 'nancy.l@example.com', phone: '+1-555-0112', currentTitle: 'Finance Director', currentCompany: 'Healthcare Inc', location: 'Chicago, IL', stage: 'SCREENING', skills: ['Financial Modeling', 'ERP Systems', 'Budget Management'], linkedinUrl: 'https://linkedin.com/in/nancy-lee', clientRating: null, syncedAt: new Date() },
  { _id: 'cand_013', id: 'cand_013', recruitCrmId: 'cand_013', organizationId: 'org_financegroup', jobId: 'job_005', firstName: 'Kevin', lastName: 'Zhang', email: 'kevin.z@example.com', phone: '+1-555-0113', currentTitle: 'Senior Analyst', currentCompany: 'Consulting Firm', location: 'Chicago, IL', stage: 'SHORTLISTED', skills: ['Excel', 'SQL', 'Power BI', 'Python'], linkedinUrl: 'https://linkedin.com/in/kevin-zhang', clientRating: null, syncedAt: new Date() },
  { _id: 'cand_014', id: 'cand_014', recruitCrmId: 'cand_014', organizationId: 'org_financegroup', jobId: 'job_005', firstName: 'Aisha', lastName: 'Johnson', email: 'aisha.j@example.com', phone: '+1-555-0114', currentTitle: 'Financial Analyst', currentCompany: 'Asset Management', location: 'New York, NY', stage: 'APPLIED', skills: ['Financial Analysis', 'Tableau', 'Bloomberg Terminal'], linkedinUrl: 'https://linkedin.com/in/aisha-johnson', clientRating: null, syncedAt: new Date() },
];

// Mutable — actions mutate these in-process (resets on server restart, fine for prototype)
export const auditLogs: any[] = [];
let auditLogCounter = 0;

export function addAuditLog(entry: any) {
  const log = { ...entry, _id: `log_${++auditLogCounter}`, id: `log_${auditLogCounter}`, createdAt: new Date() };
  auditLogs.unshift(log);
  return log;
}
