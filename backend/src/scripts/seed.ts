import 'reflect-metadata';
import { AppDataSource } from '../config/data-source';
import { Organization, User, OrganizationMembership, Job, Candidate, Application } from '../entities';
import { UserRole, JobStatus, WorkType, PayrollType, CandidateStage, CandidateSource } from '../types';

/**
 * Seeds the local Postgres database with the portal's demo dataset — the
 * same organizations, users, jobs and candidates the old in-memory mock
 * store used to serve. Safe to re-run: it truncates the app tables first.
 *
 * Run with `npm run seed` once DATABASE_URL/PG* env vars point at Postgres.
 */

// Exactly 3 client organizations + 1 SWFS admin (see USERS below) — the
// admin sees every organization's data, each client user sees only their
// own org's jobs/candidates (enforced server-side, not just by this seed).
const ORGS = [
  {
    name: 'TechCorp Inc',
    slug: 'org_techcorp',
    industry: 'Technology',
    website: 'https://techcorp.example.com',
    email: 'partnerships@techcorp.example.com',
    description: 'A leading technology company focused on cloud-native software solutions.',
    hq: 'San Francisco, CA',
    employeeCount: 250,
    founded: '2015',
    socialLinks: {
      linkedin: 'https://linkedin.com/company/techcorp',
      twitter: 'https://twitter.com/techcorp',
      facebook: 'https://facebook.com/techcorp',
    },
    contacts: [
      { name: 'Sarah Chen', title: 'Head of Talent', email: 'sarah.chen@techcorp.example.com' },
      { name: 'Mark Johnson', title: 'CTO', email: 'mark.johnson@techcorp.example.com' },
    ],
  },
  {
    name: 'FinanceGroup LLC',
    slug: 'org_financegroup',
    industry: 'Financial Services',
    website: 'https://financegroup.example.com',
    email: 'partnerships@financegroup.example.com',
    description: 'A boutique financial services firm specializing in investment management and advisory.',
    hq: 'Chicago, IL',
    employeeCount: 120,
    founded: '2010',
    socialLinks: {
      linkedin: 'https://linkedin.com/company/financegroup',
      twitter: 'https://twitter.com/financegroup',
      facebook: 'https://facebook.com/financegroup',
    },
    contacts: [
      { name: 'Jennifer Walsh', title: 'HR Director', email: 'j.walsh@financegroup.example.com' },
      { name: 'Patrick Moore', title: 'CEO', email: 'p.moore@financegroup.example.com' },
    ],
  },
  {
    name: 'Meridian Health Partners',
    slug: 'org_meridianhealth',
    industry: 'Healthcare',
    website: 'https://meridianhealth.example.com',
    email: 'partnerships@meridianhealth.example.com',
    description: 'A regional health system staffing clinical and administrative roles across its network of hospitals and clinics.',
    hq: 'Boston, MA',
    employeeCount: 480,
    founded: '2008',
    socialLinks: {
      linkedin: 'https://linkedin.com/company/meridianhealth',
      twitter: 'https://twitter.com/meridianhealth',
      facebook: 'https://facebook.com/meridianhealth',
    },
    contacts: [
      { name: 'Rachel Nguyen', title: 'Director of Talent Acquisition', email: 'r.nguyen@meridianhealth.example.com' },
      { name: 'Dr. Omar Farouk', title: 'Chief Medical Officer', email: 'o.farouk@meridianhealth.example.com' },
    ],
  },
];

const USERS: { email: string; name: string; role: UserRole; orgSlug: string }[] = [
  { email: 'admin@swfs.ai', name: 'SWFS Admin', role: 'ADMIN', orgSlug: 'org_techcorp' },
  { email: 'client.admin@techcorp.com', name: 'Sarah Chen', role: 'CLIENT', orgSlug: 'org_techcorp' },
  { email: 'client.admin@financegroup.com', name: 'Jennifer Walsh', role: 'CLIENT', orgSlug: 'org_financegroup' },
  { email: 'client.admin@meridianhealth.com', name: 'Rachel Nguyen', role: 'CLIENT', orgSlug: 'org_meridianhealth' },
];

const JOBS: {
  key: string;
  orgSlug: string;
  title: string;
  department?: string;
  location?: string;
  status: JobStatus;
  openedAt: string;
  description: string;
  payRate: number;
  billRate: number;
  billableHours: string;
  workType: WorkType;
  payrollType: PayrollType;
}[] = [
  { key: 'job_001', orgSlug: 'org_techcorp', title: 'Senior Software Engineer', department: 'Engineering', location: 'Remote (US)', status: 'OPEN', openedAt: '2024-11-01', description: 'Own the design and delivery of core backend services for our cloud platform, mentoring mid-level engineers along the way.', payRate: 70, billRate: 90, billableHours: '8 hrs/day', workType: 'CONTRACT_TO_HIRE', payrollType: 'THIRD_PARTY' },
  { key: 'job_002', orgSlug: 'org_techcorp', title: 'Frontend Developer', department: 'Engineering', location: 'New York, NY', status: 'OPEN', openedAt: '2024-11-15', description: 'Build and maintain customer-facing React interfaces in close collaboration with product and design.', payRate: 55, billRate: 72, billableHours: '8 hrs/day', workType: 'FULL_TIME', payrollType: 'IN_HOUSE' },
  { key: 'job_003', orgSlug: 'org_techcorp', title: 'DevOps Engineer', department: 'Infrastructure', location: 'Austin, TX', status: 'CLOSED', openedAt: '2024-10-01', description: 'Manage CI/CD pipelines and cloud infrastructure across staging and production environments.', payRate: 75, billRate: 95, billableHours: '7 hrs/day', workType: 'CONTRACT', payrollType: 'THIRD_PARTY' },
  { key: 'job_004', orgSlug: 'org_financegroup', title: 'Chief Financial Officer', department: 'Finance', location: 'Chicago, IL', status: 'OPEN', openedAt: '2024-11-10', description: 'Lead financial strategy, reporting, and treasury operations for a growing investment firm.', payRate: 115, billRate: 145, billableHours: '8 hrs/day', workType: 'FULL_TIME', payrollType: 'IN_HOUSE' },
  { key: 'job_005', orgSlug: 'org_financegroup', title: 'Financial Analyst', department: 'Finance', location: 'Chicago, IL', status: 'OPEN', openedAt: '2024-11-20', description: 'Support quarterly forecasting, budget variance analysis, and ad hoc financial modeling.', payRate: 40, billRate: 55, billableHours: '8 hrs/day', workType: 'CONTRACT', payrollType: 'THIRD_PARTY' },
  { key: 'job_006', orgSlug: 'org_meridianhealth', title: 'Registered Nurse - ICU', department: 'Clinical Operations', location: 'Boston, MA', status: 'OPEN', openedAt: '2024-11-05', description: 'Provide direct patient care in a 24-bed ICU, working rotating shifts alongside a multidisciplinary critical care team.', payRate: 48, billRate: 64, billableHours: '7.2 hrs/day', workType: 'FULL_TIME', payrollType: 'IN_HOUSE' },
  { key: 'job_007', orgSlug: 'org_meridianhealth', title: 'Director of Nursing', department: 'Clinical Operations', location: 'Boston, MA', status: 'OPEN', openedAt: '2024-11-18', description: 'Oversee nursing staff, scheduling, and clinical quality standards across two hospital campuses.', payRate: 72, billRate: 96, billableHours: '8 hrs/day', workType: 'FULL_TIME', payrollType: 'IN_HOUSE' },
];

const CANDIDATES: {
  orgSlug: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  currentTitle: string;
  currentCompany: string;
  location: string;
  skills: string[];
  linkedinUrl: string;
  jobLinks: { jobKey: string; stage: CandidateStage }[];
  source?: CandidateSource;
}[] = [
  { orgSlug: 'org_techcorp', firstName: 'Alex', lastName: 'Chen', email: 'alex.chen@example.com', phone: '+1-555-0101', currentTitle: 'Software Engineer', currentCompany: 'StartupXYZ', location: 'San Francisco, CA', skills: ['TypeScript', 'React', 'Node.js', 'AWS'], linkedinUrl: 'https://linkedin.com/in/alex-chen', jobLinks: [{ jobKey: 'job_001', stage: 'INTERVIEW' }] },
  { orgSlug: 'org_techcorp', firstName: 'Maria', lastName: 'Rodriguez', email: 'maria.r@example.com', phone: '+1-555-0102', currentTitle: 'Lead Engineer', currentCompany: 'BigTech Corp', location: 'Seattle, WA', skills: ['Go', 'Kubernetes', 'Docker', 'Python'], linkedinUrl: 'https://linkedin.com/in/maria-rodriguez', jobLinks: [{ jobKey: 'job_001', stage: 'SHORTLISTED' }, { jobKey: 'job_002', stage: 'APPLIED' }] },
  { orgSlug: 'org_techcorp', firstName: 'James', lastName: 'Wilson', email: 'james.w@example.com', phone: '+1-555-0103', currentTitle: 'Full Stack Developer', currentCompany: 'Agency Inc', location: 'New York, NY', skills: ['JavaScript', 'Vue.js', 'PostgreSQL'], linkedinUrl: 'https://linkedin.com/in/james-wilson', jobLinks: [{ jobKey: 'job_001', stage: 'SCREENING' }] },
  { orgSlug: 'org_techcorp', firstName: 'Priya', lastName: 'Patel', email: 'priya.p@example.com', phone: '+1-555-0104', currentTitle: 'Backend Engineer', currentCompany: 'FinTech Ltd', location: 'Austin, TX', skills: ['Java', 'Spring Boot', 'MySQL', 'Kafka'], linkedinUrl: 'https://linkedin.com/in/priya-patel', jobLinks: [{ jobKey: 'job_001', stage: 'APPLIED' }] },
  { orgSlug: 'org_techcorp', firstName: 'David', lastName: 'Kim', email: 'david.k@example.com', phone: '+1-555-0105', currentTitle: 'Senior Developer', currentCompany: 'Consulting Co', location: 'Boston, MA', skills: ['Ruby on Rails', 'React', 'Redis'], linkedinUrl: 'https://linkedin.com/in/david-kim', jobLinks: [{ jobKey: 'job_001', stage: 'REJECTED' }] },
  { orgSlug: 'org_techcorp', firstName: 'Emma', lastName: 'Thompson', email: 'emma.t@example.com', phone: '+1-555-0106', currentTitle: 'UI Developer', currentCompany: 'Design Studio', location: 'New York, NY', skills: ['React', 'TypeScript', 'CSS', 'Figma'], linkedinUrl: 'https://linkedin.com/in/emma-thompson', jobLinks: [{ jobKey: 'job_002', stage: 'INTERVIEW' }] },
  { orgSlug: 'org_techcorp', firstName: 'Carlos', lastName: 'Santos', email: 'carlos.s@example.com', phone: '+1-555-0107', currentTitle: 'Frontend Engineer', currentCompany: 'E-commerce Co', location: 'Miami, FL', skills: ['Next.js', 'GraphQL', 'Tailwind CSS'], linkedinUrl: 'https://linkedin.com/in/carlos-santos', jobLinks: [{ jobKey: 'job_002', stage: 'SCREENING' }] },
  { orgSlug: 'org_techcorp', firstName: 'Sophie', lastName: 'Martin', email: 'sophie.m@example.com', phone: '+1-555-0108', currentTitle: 'React Developer', currentCompany: 'SaaS Platform', location: 'Los Angeles, CA', skills: ['React', 'Redux', 'Testing Library', 'Storybook'], linkedinUrl: 'https://linkedin.com/in/sophie-martin', jobLinks: [{ jobKey: 'job_002', stage: 'SHORTLISTED' }] },
  { orgSlug: 'org_techcorp', firstName: 'Ryan', lastName: 'Brooks', email: 'ryan.b@example.com', phone: '+1-555-0109', currentTitle: 'DevOps Lead', currentCompany: 'Cloud Corp', location: 'Austin, TX', skills: ['Terraform', 'AWS', 'CI/CD', 'Kubernetes'], linkedinUrl: 'https://linkedin.com/in/ryan-brooks', jobLinks: [{ jobKey: 'job_003', stage: 'HIRED' }] },
  { orgSlug: 'org_financegroup', firstName: 'Linda', lastName: 'Foster', email: 'linda.f@example.com', phone: '+1-555-0110', currentTitle: 'VP of Finance', currentCompany: 'Investment Group', location: 'Chicago, IL', skills: ['Financial Planning', 'M&A', 'Board Reporting', 'FP&A'], linkedinUrl: 'https://linkedin.com/in/linda-foster', jobLinks: [{ jobKey: 'job_004', stage: 'OFFER' }] },
  { orgSlug: 'org_financegroup', firstName: 'Robert', lastName: 'Davis', email: 'robert.d@example.com', phone: '+1-555-0111', currentTitle: 'CFO', currentCompany: 'Regional Bank', location: 'Detroit, MI', skills: ['GAAP', 'SOX Compliance', 'Treasury', 'Risk Management'], linkedinUrl: 'https://linkedin.com/in/robert-davis', jobLinks: [{ jobKey: 'job_004', stage: 'INTERVIEW' }] },
  { orgSlug: 'org_financegroup', firstName: 'Nancy', lastName: 'Lee', email: 'nancy.l@example.com', phone: '+1-555-0112', currentTitle: 'Finance Director', currentCompany: 'Healthcare Inc', location: 'Chicago, IL', skills: ['Financial Modeling', 'ERP Systems', 'Budget Management'], linkedinUrl: 'https://linkedin.com/in/nancy-lee', jobLinks: [{ jobKey: 'job_004', stage: 'SCREENING' }, { jobKey: 'job_005', stage: 'SHORTLISTED' }] },
  { orgSlug: 'org_financegroup', firstName: 'Kevin', lastName: 'Zhang', email: 'kevin.z@example.com', phone: '+1-555-0113', currentTitle: 'Senior Analyst', currentCompany: 'Consulting Firm', location: 'Chicago, IL', skills: ['Excel', 'SQL', 'Power BI', 'Python'], linkedinUrl: 'https://linkedin.com/in/kevin-zhang', jobLinks: [{ jobKey: 'job_005', stage: 'SHORTLISTED' }] },
  { orgSlug: 'org_financegroup', firstName: 'Aisha', lastName: 'Johnson', email: 'aisha.j@example.com', phone: '+1-555-0114', currentTitle: 'Financial Analyst', currentCompany: 'Asset Management', location: 'New York, NY', skills: ['Financial Analysis', 'Tableau', 'Bloomberg Terminal'], linkedinUrl: 'https://linkedin.com/in/aisha-johnson', jobLinks: [{ jobKey: 'job_005', stage: 'APPLIED' }] },
  { orgSlug: 'org_techcorp', firstName: 'Olivia', lastName: 'Brown', email: 'olivia.b@example.com', phone: '+1-555-0115', currentTitle: 'Product Designer', currentCompany: 'Freelance', location: 'Denver, CO', skills: ['Figma', 'UX Research'], linkedinUrl: 'https://linkedin.com/in/olivia-brown', jobLinks: [] },
  { orgSlug: 'org_financegroup', firstName: 'Daniel', lastName: 'Reyes', email: 'daniel.r@example.com', phone: '+1-555-0116', currentTitle: 'Accountant', currentCompany: 'Reyes & Co', location: 'Dallas, TX', skills: ['QuickBooks', 'Tax Planning'], linkedinUrl: 'https://linkedin.com/in/daniel-reyes', jobLinks: [] },
  { orgSlug: 'org_meridianhealth', firstName: 'Grace', lastName: 'Kim', email: 'grace.kim@example.com', phone: '+1-555-0117', currentTitle: 'Registered Nurse', currentCompany: "St. Luke's Medical Center", location: 'Boston, MA', skills: ['ICU Care', 'Critical Care', 'ACLS', 'Patient Assessment'], linkedinUrl: 'https://linkedin.com/in/grace-kim', jobLinks: [{ jobKey: 'job_006', stage: 'SHORTLISTED' }] },
  { orgSlug: 'org_meridianhealth', firstName: 'Marcus', lastName: 'Lee', email: 'marcus.lee@example.com', phone: '+1-555-0118', currentTitle: 'Nurse Practitioner', currentCompany: 'Beacon Health', location: 'Cambridge, MA', skills: ['Acute Care', 'EHR Systems', 'Patient Education'], linkedinUrl: 'https://linkedin.com/in/marcus-lee', jobLinks: [{ jobKey: 'job_006', stage: 'INTERVIEW' }] },
  { orgSlug: 'org_meridianhealth', firstName: 'Samantha', lastName: 'Wright', email: 'samantha.w@example.com', phone: '+1-555-0119', currentTitle: 'ICU Nurse', currentCompany: 'Riverside Hospital', location: 'Providence, RI', skills: ['Ventilator Management', 'Critical Care', 'Trauma'], linkedinUrl: 'https://linkedin.com/in/samantha-wright', jobLinks: [{ jobKey: 'job_006', stage: 'APPLIED' }] },
  { orgSlug: 'org_meridianhealth', firstName: 'Thomas', lastName: 'Nguyen', email: 'thomas.n@example.com', phone: '+1-555-0120', currentTitle: 'Nursing Supervisor', currentCompany: 'Mercy General', location: 'Worcester, MA', skills: ['Staff Management', 'Clinical Quality', 'Scheduling'], linkedinUrl: 'https://linkedin.com/in/thomas-nguyen', jobLinks: [{ jobKey: 'job_007', stage: 'SHORTLISTED' }] },
  { orgSlug: 'org_meridianhealth', firstName: 'Isabella', lastName: 'Garcia', email: 'isabella.g@example.com', phone: '+1-555-0121', currentTitle: 'Clinical Operations Manager', currentCompany: 'Coastal Health Network', location: 'Boston, MA', skills: ['Operations', 'Compliance', 'Team Leadership'], linkedinUrl: 'https://linkedin.com/in/isabella-garcia', jobLinks: [{ jobKey: 'job_007', stage: 'APPLIED' }] },
  { orgSlug: 'org_meridianhealth', firstName: 'Daniel', lastName: 'Osei', email: 'daniel.osei@example.com', phone: '+1-555-0122', currentTitle: 'Registered Nurse', currentCompany: 'Per Diem / Freelance', location: 'Boston, MA', skills: ['Med-Surg', 'Patient Care'], linkedinUrl: 'https://linkedin.com/in/daniel-osei', jobLinks: [] },
];

async function seed() {
  const ds = await AppDataSource.initialize();
  console.log('Seeding database…');

  // Idempotent: wipe app tables (dependency order doesn't matter with CASCADE).
  await ds.query(
    'TRUNCATE TABLE applications, candidate_feedback, candidates, jobs, organization_contacts, organization_memberships, audit_logs, users, organizations CASCADE'
  );

  const orgRepo = ds.getRepository(Organization);
  const userRepo = ds.getRepository(User);
  const membershipRepo = ds.getRepository(OrganizationMembership);
  const jobRepo = ds.getRepository(Job);
  const candidateRepo = ds.getRepository(Candidate);
  const applicationRepo = ds.getRepository(Application);

  const orgsBySlug = new Map<string, Organization>();
  for (const { contacts, ...data } of ORGS) {
    const org = await orgRepo.save(orgRepo.create({ ...data, contacts: contacts as any }));
    orgsBySlug.set(data.slug, org);
  }

  for (const u of USERS) {
    const user = await userRepo.save(userRepo.create({ email: u.email, name: u.name }));
    const org = orgsBySlug.get(u.orgSlug);
    if (org) {
      await membershipRepo.save(membershipRepo.create({ organization: org, user, role: u.role }));
    }
  }

  const jobsByKey = new Map<string, Job>();
  for (const { key, orgSlug, ...data } of JOBS) {
    const org = orgsBySlug.get(orgSlug)!;
    const job = await jobRepo.save(jobRepo.create({ ...data, openedAt: new Date(data.openedAt), organization: org }));
    jobsByKey.set(key, job);
  }

  for (const c of CANDIDATES) {
    const { orgSlug, jobLinks, ...data } = c;
    const candidate = await candidateRepo.save(
      candidateRepo.create({ ...data, source: data.source ?? 'PORTAL' })
    );
    for (const link of jobLinks) {
      const job = jobsByKey.get(link.jobKey)!;
      await applicationRepo.save(applicationRepo.create({ candidate, job, stage: link.stage }));
      await jobRepo.increment({ id: job.id }, 'totalCandidates', 1);
    }
  }

  console.log('Seed complete.');
  await ds.destroy();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
