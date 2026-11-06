/**
 * Full demo dataset: wipes every table + uploaded file and rebuilds a large,
 * realistic dataset that exercises every feature of the portal.
 *
 *   npm --prefix backend run seed:demo
 *
 * All dates are relative to "now", so time-based features (daily digest,
 * new openings, interviews today, expiring offers, roles at risk) are live
 * whenever you run it. Deterministic: same data every run.
 *
 * Coverage map → docs/DEMO_DATA.md
 */
import 'reflect-metadata';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import { AppDataSource } from '../config/data-source';
import {
  Organization,
  User,
  OrganizationMembership,
  Job,
  Candidate,
  Application,
  CandidateFeedback,
  InterviewFeedback,
  Interview,
  InterviewScorecard,
  Offer,
  Placement,
  RecordNote,
  Task,
  SavedSearch,
  Notification,
  AuditLog,
} from '../entities';
import { SCORECARD_CRITERIA, SCORECARD_RECOMMENDATIONS } from '../entities/enums';
import { RESUME_DIR, JOB_DESCRIPTION_DIR, CANDIDATE_PHOTO_DIR } from '../middleware/upload.middleware';

// ---------------------------------------------------------------------------
// Time + randomness helpers
// ---------------------------------------------------------------------------

const DAY = 86400000;
const now = new Date();
const at = (daysOffset: number, hour = 10, minute = 0) => {
  const d = new Date(now.getTime() + daysOffset * DAY);
  d.setHours(hour, minute, 0, 0);
  return d;
};
const ago = (days: number, hour = 10) => at(-days, hour);
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const ym = (d: Date) => d.toISOString().slice(0, 7);

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261102);
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const pickN = <T>(xs: T[], n: number) => [...xs].sort(() => rand() - 0.5).slice(0, n);

// ---------------------------------------------------------------------------
// People and organizations
// ---------------------------------------------------------------------------

const STAFF = [
  { key: 'alex', email: 'admin@swfs.ai', name: 'Alex Morgan' },
  { key: 'priya', email: 'priya.shah@swfs.ai', name: 'Priya Shah' },
  { key: 'marcus', email: 'marcus.lee@swfs.ai', name: 'Marcus Lee' },
  { key: 'elena', email: 'elena.garcia@swfs.ai', name: 'Elena Garcia' },
] as const;
type StaffKey = (typeof STAFF)[number]['key'];

const ORGS = [
  {
    slug: 'org_techcorp',
    name: 'TechCorp Inc',
    industry: 'Technology',
    website: 'https://techcorp.example.com',
    email: 'partnerships@techcorp.example.com',
    description: 'Cloud-native software company building developer tools and B2B SaaS platforms used by 4,000+ engineering teams.',
    hq: 'San Francisco, CA',
    employeeCount: 850,
    founded: '2014',
    socialLinks: { linkedin: 'https://linkedin.com/company/techcorp', twitter: 'https://x.com/techcorp' },
    contacts: [
      { name: 'Sarah Chen', title: 'Head of Talent', email: 'sarah.chen@techcorp.example.com', phone: '+1 415 555 0142', isDecisionMaker: true, isHiringManager: false, notes: 'Prefers a weekly pipeline sync on Tuesdays. Wants max 3 candidates per role per week.' },
      { name: 'David Park', title: 'Engineering Manager, Web', email: 'david.park@techcorp.example.com', isHiringManager: true, isDecisionMaker: false, notes: 'Hiring manager for Senior Frontend. Cares about design-system experience.' },
      { name: 'Mark Johnson', title: 'CTO', email: 'mark.johnson@techcorp.example.com', linkedinUrl: 'https://linkedin.com/in/markjohnson-cto', isDecisionMaker: true, isHiringManager: false },
    ],
    users: [
      { email: 'client.admin@techcorp.com', name: 'Sarah Chen' },
      { email: 'hiring@techcorp.com', name: 'David Park' },
    ],
  },
  {
    slug: 'org_financegroup',
    name: 'FinanceGroup LLC',
    industry: 'Financial Services',
    website: 'https://financegroup.example.com',
    email: 'talent@financegroup.example.com',
    description: 'Mid-market investment and advisory firm with a growing data platform team.',
    hq: 'New York, NY',
    employeeCount: 420,
    founded: '2008',
    socialLinks: { linkedin: 'https://linkedin.com/company/financegroup' },
    contacts: [
      { name: 'Jennifer Walsh', title: 'VP, People', email: 'jennifer.walsh@financegroup.example.com', isDecisionMaker: true, isHiringManager: false },
      { name: 'Tom Becker', title: 'Head of Data Platform', email: 'tom.becker@financegroup.example.com', isHiringManager: true, isDecisionMaker: false, notes: 'Wants Airflow + dbt hands-on, not just exposure.' },
    ],
    users: [{ email: 'client.admin@financegroup.com', name: 'Jennifer Walsh' }],
  },
  {
    slug: 'org_meridianhealth',
    name: 'Meridian Health Partners',
    industry: 'Healthcare',
    website: 'https://meridianhealth.example.com',
    email: 'recruiting@meridianhealth.example.com',
    description: 'Regional hospital network (6 hospitals, 40 clinics) modernising its clinical systems.',
    hq: 'Boston, MA',
    employeeCount: 7200,
    founded: '1987',
    socialLinks: { linkedin: 'https://linkedin.com/company/meridianhealth', facebook: 'https://facebook.com/meridianhealth' },
    contacts: [
      { name: 'Rachel Nguyen', title: 'Director of Talent Acquisition', email: 'rachel.nguyen@meridianhealth.example.com', isDecisionMaker: true, isHiringManager: true },
      { name: 'Dr. Samuel Okafor', title: 'ICU Nurse Manager', email: 'samuel.okafor@meridianhealth.example.com', isHiringManager: true, isDecisionMaker: false },
    ],
    users: [{ email: 'client.admin@meridianhealth.com', name: 'Rachel Nguyen' }],
  },
  {
    slug: 'org_nimbusretail',
    name: 'Nimbus Retail',
    industry: 'E-commerce & Retail',
    website: 'https://nimbusretail.example.com',
    email: 'people@nimbusretail.example.com',
    description: 'Direct-to-consumer outdoor apparel brand, $300M GMV, scaling operations and QA.',
    hq: 'Seattle, WA',
    employeeCount: 310,
    founded: '2017',
    socialLinks: { instagram: 'https://instagram.com/nimbusretail', linkedin: 'https://linkedin.com/company/nimbusretail' },
    contacts: [{ name: 'Omar Haddad', title: 'COO', email: 'omar.haddad@nimbusretail.example.com', isDecisionMaker: true, isHiringManager: true }],
    users: [{ email: 'client.admin@nimbusretail.com', name: 'Omar Haddad' }],
  },
  {
    slug: 'org_atlasmfg',
    name: 'Atlas Manufacturing',
    industry: 'Industrial Manufacturing',
    website: 'https://atlasmfg.example.com',
    email: 'hr@atlasmfg.example.com',
    description: 'Tier-1 automotive components manufacturer automating three assembly plants.',
    hq: 'Detroit, MI',
    employeeCount: 2600,
    founded: '1962',
    socialLinks: { linkedin: 'https://linkedin.com/company/atlasmfg' },
    contacts: [
      { name: 'Grace Kowalski', title: 'HR Business Partner', email: 'grace.kowalski@atlasmfg.example.com', isDecisionMaker: false, isHiringManager: false },
      { name: 'Luis Romero', title: 'Plant Engineering Manager', email: 'luis.romero@atlasmfg.example.com', isHiringManager: true, isDecisionMaker: true },
    ],
    users: [{ email: 'client.admin@atlasmfg.com', name: 'Grace Kowalski' }],
  },
  // New client: signed, no roles yet (empty states).
  {
    slug: 'org_heliosenergy',
    name: 'Helios Energy',
    industry: 'Renewable Energy',
    website: 'https://heliosenergy.example.com',
    description: 'Utility-scale solar developer. Contract signed; first roles expected next month.',
    hq: 'Denver, CO',
    employeeCount: 140,
    founded: '2019',
    contacts: [{ name: 'Nina Patel', title: 'Founder & CEO', email: 'nina@heliosenergy.example.com', isDecisionMaker: true, isHiringManager: true }],
    users: [{ email: 'client.admin@heliosenergy.com', name: 'Nina Patel' }],
  },
  // Former client, deactivated.
  {
    slug: 'org_legacylogistics',
    name: 'Legacy Logistics',
    industry: 'Logistics',
    website: 'https://legacylogistics.example.com',
    description: 'Former client (2023–2024). Account inactive.',
    hq: 'Chicago, IL',
    employeeCount: 900,
    founded: '1995',
    isActive: false,
    contacts: [],
    users: [],
  },
];

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

interface JobSpec {
  key: string;
  org: string;
  title: string;
  department: string;
  location: string;
  status: 'OPEN' | 'CLOSED' | 'ON_HOLD';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  workType: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'CONTRACT_TO_HIRE';
  payrollType: 'THIRD_PARTY' | 'IN_HOUSE';
  pay: number;
  bill: number;
  hours: string;
  owner: StaffKey | null;
  openedDaysAgo: number;
  description: string;
  /** null = not analysed yet (tests on-demand analysis). */
  ai: { summary: string; must: string[]; nice: string[]; titles: string[]; minYears?: number; remote?: boolean } | null;
  jdFile?: boolean;
}

const JOBS: JobSpec[] = [
  {
    key: 'tc-fe', org: 'org_techcorp', title: 'Senior Frontend Engineer', department: 'Engineering', location: 'Austin, TX (Hybrid)',
    status: 'OPEN', priority: 'HIGH', workType: 'FULL_TIME', payrollType: 'THIRD_PARTY', pay: 72, bill: 110, hours: '40', owner: 'priya', openedDaysAgo: 21,
    description: `About the role
TechCorp's Web Platform team owns the design system and the customer dashboard used by 4,000+ engineering teams.

What you'll do
- Lead development of our React + TypeScript design system
- Build performant pages in Next.js with GraphQL data fetching
- Raise the bar on testing (Jest, Testing Library) and accessibility

What you'll bring
- 5+ years building production web apps with React and TypeScript
- Experience with Next.js and GraphQL
- Strong testing habits (Jest)

Nice to have
- Storybook, design systems, AWS`,
    ai: { summary: 'Senior React/TypeScript engineer to lead TechCorp’s design system and customer dashboard. Fits someone with 5+ years of production frontend work, Next.js and GraphQL.', must: ['React', 'TypeScript', 'Next.js', 'GraphQL', 'Jest'], nice: ['Storybook', 'AWS'], titles: ['Senior Frontend Engineer', 'Frontend Engineer', 'UI Engineer'], minYears: 5 },
  },
  {
    key: 'tc-be', org: 'org_techcorp', title: 'Backend Engineer (Java)', department: 'Engineering', location: 'Remote (US)',
    status: 'OPEN', priority: 'MEDIUM', workType: 'FULL_TIME', payrollType: 'IN_HOUSE', pay: 68, bill: 102, hours: '40', owner: 'marcus', openedDaysAgo: 12,
    description: `Build and scale the billing and usage-metering services.
Must have: Java, Spring Boot, PostgreSQL, Kafka, AWS. 4+ years.
Nice to have: Kubernetes, Redis.`,
    ai: { summary: 'Backend engineer for billing and metering services on a Java/Spring Boot + Kafka stack. Fits a 4+ year JVM engineer comfortable with event streaming on AWS.', must: ['Java', 'Spring Boot', 'PostgreSQL', 'Kafka', 'AWS'], nice: ['Kubernetes', 'Redis'], titles: ['Backend Engineer', 'Software Engineer', 'Java Developer'], minYears: 4, remote: true },
  },
  {
    key: 'tc-devops', org: 'org_techcorp', title: 'DevOps / Platform Engineer', department: 'Infrastructure', location: 'Remote (US)',
    status: 'OPEN', priority: 'HIGH', workType: 'CONTRACT', payrollType: 'THIRD_PARTY', pay: 80, bill: 120, hours: '40', owner: null, openedDaysAgo: 1,
    description: 'See attached JD.',
    ai: null, // NOT analysed: JD lives in the attached PDF only → tests analysis from file.
    jdFile: true,
  },
  {
    key: 'tc-design', org: 'org_techcorp', title: 'Senior Product Designer', department: 'Design', location: 'San Francisco, CA',
    status: 'ON_HOLD', priority: 'LOW', workType: 'FULL_TIME', payrollType: 'IN_HOUSE', pay: 65, bill: 95, hours: '40', owner: 'elena', openedDaysAgo: 45,
    description: 'On hold until Q1 budget sign-off. Figma, design systems, UX research, prototyping. 6+ years.',
    ai: { summary: 'Senior product designer for TechCorp’s platform; role is paused pending budget.', must: ['Figma', 'Design Systems', 'UX Research', 'Prototyping'], nice: [], titles: ['Product Designer', 'UX Designer'], minYears: 6 },
  },
  {
    key: 'fg-fa', org: 'org_financegroup', title: 'Senior Financial Analyst', department: 'FP&A', location: 'New York, NY',
    status: 'OPEN', priority: 'HIGH', workType: 'FULL_TIME', payrollType: 'IN_HOUSE', pay: 60, bill: 92, hours: '40', owner: 'elena', openedDaysAgo: 35,
    description: 'Own monthly forecasting and board reporting. Must: Excel, Financial Modeling, SQL, Power BI, Forecasting. 5+ years. CFA a plus.',
    ai: { summary: 'Senior FP&A analyst owning forecasting and board reporting. Fits a modeller with strong Excel/SQL and BI skills, 5+ years.', must: ['Excel', 'Financial Modeling', 'SQL', 'Power BI', 'Forecasting'], nice: ['CFA', 'Tableau'], titles: ['Financial Analyst', 'FP&A Analyst', 'Senior Financial Analyst'], minYears: 5 },
  },
  {
    key: 'fg-de', org: 'org_financegroup', title: 'Data Engineer', department: 'Data Platform', location: 'Jersey City, NJ (Hybrid)',
    status: 'OPEN', priority: 'MEDIUM', workType: 'CONTRACT_TO_HIRE', payrollType: 'THIRD_PARTY', pay: 75, bill: 112, hours: '40', owner: 'marcus', openedDaysAgo: 9,
    description: 'Build batch and streaming pipelines for the new lakehouse. Must: Python, Spark, Airflow, SQL, dbt, AWS. 3+ years.',
    ai: { summary: 'Data engineer building lakehouse pipelines with Spark, Airflow and dbt on AWS. Fits a 3+ year pipeline engineer with hands-on orchestration experience.', must: ['Python', 'Spark', 'Airflow', 'SQL', 'dbt', 'AWS'], nice: ['Snowflake', 'Kafka'], titles: ['Data Engineer', 'Analytics Engineer'], minYears: 3 },
  },
  {
    key: 'fg-risk', org: 'org_financegroup', title: 'Quantitative Risk Analyst', department: 'Risk', location: 'New York, NY',
    status: 'CLOSED', priority: 'MEDIUM', workType: 'CONTRACT', payrollType: 'THIRD_PARTY', pay: 85, bill: 125, hours: '40', owner: 'priya', openedDaysAgo: 160,
    description: 'Filled. Python, statistics, VaR modelling.',
    ai: { summary: 'Quant risk analyst (filled).', must: ['Python', 'Statistics', 'Risk Modeling'], nice: [], titles: ['Risk Analyst', 'Quantitative Analyst'], minYears: 3 },
  },
  {
    key: 'mh-rn', org: 'org_meridianhealth', title: 'Registered Nurse – ICU', department: 'Critical Care', location: 'Boston, MA',
    status: 'OPEN', priority: 'HIGH', workType: 'FULL_TIME', payrollType: 'IN_HOUSE', pay: 52, bill: 78, hours: '36', owner: 'elena', openedDaysAgo: 5,
    description: 'ICU RN for a 24-bed unit. Must: active RN license, BLS, ACLS, ICU experience, Epic EHR. 2+ years ICU. CCRN preferred.',
    ai: { summary: 'ICU registered nurse for a 24-bed critical care unit. Fits an RN with 2+ years ICU experience, BLS/ACLS and Epic charting.', must: ['BLS', 'ACLS', 'ICU', 'Epic EHR', 'Patient Care'], nice: ['CCRN'], titles: ['Registered Nurse', 'ICU Nurse', 'Critical Care Nurse'], minYears: 2 },
  },
  {
    key: 'mh-hit', org: 'org_meridianhealth', title: 'Healthcare IT Analyst (Epic)', department: 'Clinical Systems', location: 'Boston, MA (Hybrid)',
    status: 'OPEN', priority: 'MEDIUM', workType: 'PART_TIME', payrollType: 'THIRD_PARTY', pay: 55, bill: 85, hours: '24', owner: 'priya', openedDaysAgo: 2,
    description: 'Support Epic build and HL7/FHIR interfaces during the network-wide upgrade. Epic certification required. SQL helpful.',
    ai: { summary: 'Part-time Epic analyst supporting build and HL7/FHIR interfaces during an EHR upgrade. Fits an Epic-certified analyst with interface experience.', must: ['Epic', 'HL7', 'FHIR', 'SQL'], nice: ['Cerner'], titles: ['Healthcare IT Analyst', 'Epic Analyst', 'Clinical Systems Analyst'], minYears: 3 },
  },
  {
    key: 'mh-ml', org: 'org_meridianhealth', title: 'Machine Learning Engineer', department: 'Data Science', location: 'Remote (US)',
    status: 'OPEN', priority: 'MEDIUM', workType: 'FULL_TIME', payrollType: 'THIRD_PARTY', pay: 90, bill: 135, hours: '40', owner: 'marcus', openedDaysAgo: 18,
    description: 'Productionise readmission-risk models. Must: Python, PyTorch, MLOps, SQL, AWS. 4+ years. Healthcare data a plus.',
    ai: { summary: 'ML engineer productionising clinical risk models. Fits a 4+ year Python/PyTorch engineer with MLOps experience on AWS.', must: ['Python', 'PyTorch', 'MLOps', 'SQL', 'AWS'], nice: ['scikit-learn', 'LLMs'], titles: ['Machine Learning Engineer', 'ML Engineer', 'Data Scientist'], minYears: 4, remote: true },
  },
  {
    key: 'nr-ops', org: 'org_nimbusretail', title: 'E-commerce Operations Manager', department: 'Operations', location: 'Seattle, WA',
    status: 'OPEN', priority: 'MEDIUM', workType: 'FULL_TIME', payrollType: 'IN_HOUSE', pay: 50, bill: 80, hours: '40', owner: 'priya', openedDaysAgo: 28,
    description: 'Run fulfilment, inventory and marketplace ops. Shopify, inventory management, supply chain, SQL, vendor management. 5+ years.',
    ai: { summary: 'Ops manager for a DTC apparel brand covering fulfilment, inventory and marketplaces. Fits a 5+ year e-commerce operator.', must: ['Shopify', 'Inventory Management', 'Supply Chain', 'Vendor Management'], nice: ['SQL'], titles: ['Operations Manager', 'E-commerce Manager'], minYears: 5 },
  },
  {
    key: 'nr-qa', org: 'org_nimbusretail', title: 'QA Automation Engineer', department: 'Engineering', location: 'Remote (US)',
    status: 'OPEN', priority: 'LOW', workType: 'CONTRACT', payrollType: 'THIRD_PARTY', pay: 55, bill: 82, hours: '40', owner: 'marcus', openedDaysAgo: 0,
    description: 'Build end-to-end test automation for the storefront and checkout. Must: Playwright or Cypress, JavaScript/TypeScript, API testing, CI/CD. 3+ years.',
    ai: null, // NOT analysed: created today → tests on-demand analysis + keyword fallback.
  },
  {
    key: 'nr-ds', org: 'org_nimbusretail', title: 'Data Scientist, Pricing', department: 'Analytics', location: 'Seattle, WA',
    status: 'ON_HOLD', priority: 'LOW', workType: 'FULL_TIME', payrollType: 'IN_HOUSE', pay: 70, bill: 105, hours: '40', owner: 'elena', openedDaysAgo: 60,
    description: 'Paused. Pricing elasticity models. Python, SQL, experimentation.',
    ai: { summary: 'Pricing data scientist (paused).', must: ['Python', 'SQL', 'Experimentation'], nice: [], titles: ['Data Scientist'], minYears: 3 },
  },
  {
    key: 'am-me', org: 'org_atlasmfg', title: 'Mechanical Design Engineer', department: 'Product Engineering', location: 'Detroit, MI',
    status: 'OPEN', priority: 'MEDIUM', workType: 'FULL_TIME', payrollType: 'IN_HOUSE', pay: 48, bill: 74, hours: '40', owner: 'elena', openedDaysAgo: 14,
    description: 'Design brackets and housings for EV battery assemblies. SolidWorks, GD&T, CAD, FEA, DFM. 3+ years automotive.',
    ai: { summary: 'Mechanical design engineer for EV battery assembly components. Fits a 3+ year automotive CAD engineer with GD&T and FEA.', must: ['SolidWorks', 'GD&T', 'CAD', 'FEA'], nice: ['DFM'], titles: ['Mechanical Engineer', 'Design Engineer'], minYears: 3 },
  },
  {
    key: 'am-plc', org: 'org_atlasmfg', title: 'Controls Engineer (PLC)', department: 'Plant Engineering', location: 'Detroit, MI',
    status: 'OPEN', priority: 'HIGH', workType: 'CONTRACT', payrollType: 'THIRD_PARTY', pay: 62, bill: 95, hours: '45', owner: 'marcus', openedDaysAgo: 40,
    description: 'Commission new robotic cells. PLC (Allen-Bradley), SCADA, HMI, AutoCAD Electrical, robotics. 4+ years.',
    ai: { summary: 'Controls engineer commissioning robotic assembly cells. Fits a 4+ year Allen-Bradley PLC engineer with SCADA/HMI work.', must: ['PLC', 'Allen-Bradley', 'SCADA', 'HMI'], nice: ['AutoCAD Electrical', 'Robotics'], titles: ['Controls Engineer', 'Automation Engineer'], minYears: 4 },
  },
  {
    key: 'am-sc', org: 'org_atlasmfg', title: 'Supply Chain Analyst', department: 'Operations', location: 'Detroit, MI',
    status: 'CLOSED', priority: 'LOW', workType: 'FULL_TIME', payrollType: 'IN_HOUSE', pay: 40, bill: 62, hours: '40', owner: 'priya', openedDaysAgo: 200,
    description: 'Filled.',
    ai: { summary: 'Supply chain analyst (filled).', must: ['Supply Chain', 'Excel', 'SQL'], nice: [], titles: ['Supply Chain Analyst'], minYears: 2 },
  },
];

// ---------------------------------------------------------------------------
// Candidate clusters (skills/titles/companies per talent segment)
// ---------------------------------------------------------------------------

interface Cluster {
  key: string;
  titles: string[];
  skills: string[];
  companies: string[];
  locations: string[];
  schools: [string, string, string][]; // institution, degree, field
  certs: string[];
  tags: string[];
}

const C: Record<string, Cluster> = {
  fe: { key: 'fe', titles: ['Senior Frontend Engineer', 'Frontend Engineer', 'UI Engineer', 'Full Stack Developer'], skills: ['React', 'TypeScript', 'JavaScript', 'Next.js', 'GraphQL', 'Redux', 'Jest', 'Storybook', 'Tailwind', 'Node.js', 'AWS'], companies: ['Northwind Software', 'Pixel Labs', 'Brightside', 'Contoso Digital', 'Hooli'], locations: ['Austin, TX', 'Dallas, TX', 'Remote (US)', 'Denver, CO', 'Bengaluru, India'], schools: [['University of Texas at Austin', 'BS', 'Computer Science'], ['Georgia Tech', 'BS', 'Computer Engineering'], ['IIT Bombay', 'BTech', 'Computer Science']], certs: ['AWS Certified Developer – Associate'], tags: ['frontend', 'react'] },
  be: { key: 'be', titles: ['Backend Engineer', 'Senior Software Engineer', 'Java Developer'], skills: ['Java', 'Spring Boot', 'Kafka', 'PostgreSQL', 'Microservices', 'AWS', 'Docker', 'Kubernetes', 'Redis'], companies: ['Globex', 'Initech', 'Fabrikam', 'Umbrella Digital'], locations: ['Remote (US)', 'Chicago, IL', 'Pune, India', 'Berlin, Germany'], schools: [['University of Illinois', 'BS', 'Computer Science'], ['TU Munich', 'MSc', 'Informatics'], ['College of Engineering Pune', 'BE', 'Information Technology']], certs: ['Oracle Certified Professional, Java SE', 'AWS Certified Solutions Architect – Associate'], tags: ['backend', 'java'] },
  de: { key: 'de', titles: ['Data Engineer', 'Senior Data Engineer', 'Analytics Engineer'], skills: ['Python', 'SQL', 'Spark', 'Airflow', 'dbt', 'AWS', 'Snowflake', 'Kafka'], companies: ['Datastream', 'Globex', 'Ledgerline', 'Fabrikam'], locations: ['Jersey City, NJ', 'New York, NY', 'Remote (US)', 'Hyderabad, India'], schools: [['Rutgers University', 'BS', 'Statistics'], ['NYU', 'MS', 'Data Science']], certs: ['Databricks Certified Data Engineer Associate', 'AWS Certified Data Engineer'], tags: ['data', 'spark'] },
  ml: { key: 'ml', titles: ['Machine Learning Engineer', 'Data Scientist', 'Applied Scientist'], skills: ['Python', 'PyTorch', 'TensorFlow', 'MLOps', 'SQL', 'scikit-learn', 'AWS', 'LLMs'], companies: ['Cortex AI', 'Hooli', 'MedSignal', 'Initech'], locations: ['Remote (US)', 'Boston, MA', 'San Francisco, CA', 'Toronto, Canada'], schools: [['MIT', 'MS', 'EECS'], ['Carnegie Mellon University', 'MS', 'Machine Learning'], ['University of Toronto', 'BSc', 'Computer Science']], certs: ['Google Professional ML Engineer'], tags: ['ml', 'ai'] },
  ops: { key: 'ops', titles: ['DevOps Engineer', 'Platform Engineer', 'Site Reliability Engineer'], skills: ['Kubernetes', 'Terraform', 'AWS', 'Docker', 'CI/CD', 'Linux', 'Prometheus', 'Python'], companies: ['Cloudnine', 'Umbrella Digital', 'Northwind Software'], locations: ['Remote (US)', 'Portland, OR', 'Austin, TX'], schools: [['Oregon State University', 'BS', 'Computer Science']], certs: ['Certified Kubernetes Administrator', 'HashiCorp Terraform Associate'], tags: ['devops', 'cloud'] },
  fin: { key: 'fin', titles: ['Senior Financial Analyst', 'FP&A Analyst', 'Financial Analyst'], skills: ['Excel', 'Financial Modeling', 'SQL', 'Power BI', 'Forecasting', 'Valuation', 'Tableau'], companies: ['Ledgerline', 'Sterling Capital', 'Northbridge Advisors'], locations: ['New York, NY', 'Hoboken, NJ', 'Stamford, CT'], schools: [['Baruch College', 'BBA', 'Finance'], ['NYU Stern', 'MBA', 'Finance']], certs: ['CFA Level II', 'CPA'], tags: ['finance'] },
  rn: { key: 'rn', titles: ['Registered Nurse', 'ICU Nurse', 'Critical Care Nurse'], skills: ['BLS', 'ACLS', 'ICU', 'Patient Care', 'Epic EHR', 'Critical Care', 'Ventilator Management'], companies: ['St. Mary’s Hospital', 'Bay State Medical', 'Mercy General'], locations: ['Boston, MA', 'Worcester, MA', 'Providence, RI'], schools: [['Boston College', 'BSN', 'Nursing'], ['Northeastern University', 'BSN', 'Nursing']], certs: ['RN License (MA)', 'BLS', 'ACLS', 'CCRN'], tags: ['healthcare', 'nursing'] },
  hit: { key: 'hit', titles: ['Healthcare IT Analyst', 'Epic Analyst', 'Clinical Systems Analyst'], skills: ['Epic', 'HL7', 'FHIR', 'SQL', 'Clinical Workflows', 'Cerner'], companies: ['Bay State Medical', 'CareBridge Systems'], locations: ['Boston, MA', 'Remote (US)'], schools: [['UMass Boston', 'BS', 'Health Informatics']], certs: ['Epic Certified – Ambulatory', 'Epic Certified – Bridges'], tags: ['healthcare', 'epic'] },
  ecom: { key: 'ecom', titles: ['E-commerce Operations Manager', 'Operations Manager', 'Supply Chain Analyst'], skills: ['Shopify', 'Inventory Management', 'Supply Chain', 'Excel', 'SQL', 'Vendor Management', 'Logistics'], companies: ['Trailhead Outfitters', 'Northwind Traders', 'Cascade Goods'], locations: ['Seattle, WA', 'Tacoma, WA', 'Portland, OR'], schools: [['University of Washington', 'BA', 'Business Administration']], certs: ['APICS CSCP'], tags: ['operations'] },
  qa: { key: 'qa', titles: ['QA Automation Engineer', 'SDET', 'Test Engineer'], skills: ['Playwright', 'Cypress', 'Selenium', 'TypeScript', 'JavaScript', 'API Testing', 'CI/CD', 'Java'], companies: ['Pixel Labs', 'Cascade Goods', 'Contoso Digital'], locations: ['Remote (US)', 'Seattle, WA', 'Chennai, India'], schools: [['Anna University', 'BE', 'Computer Science'], ['Washington State University', 'BS', 'Software Engineering']], certs: ['ISTQB Foundation'], tags: ['qa'] },
  mech: { key: 'mech', titles: ['Mechanical Design Engineer', 'Design Engineer', 'Mechanical Engineer'], skills: ['SolidWorks', 'GD&T', 'CAD', 'FEA', 'AutoCAD', 'DFM'], companies: ['Great Lakes Auto', 'Motorworks', 'Dynamic Components'], locations: ['Detroit, MI', 'Ann Arbor, MI', 'Toledo, OH'], schools: [['University of Michigan', 'BSE', 'Mechanical Engineering'], ['Kettering University', 'BS', 'Mechanical Engineering']], certs: ['CSWP (SolidWorks Professional)'], tags: ['manufacturing'] },
  ctrl: { key: 'ctrl', titles: ['Controls Engineer', 'Automation Engineer'], skills: ['PLC', 'Allen-Bradley', 'SCADA', 'HMI', 'AutoCAD Electrical', 'Robotics'], companies: ['Great Lakes Auto', 'Motorworks', 'Rockline Automation'], locations: ['Detroit, MI', 'Flint, MI', 'Columbus, OH'], schools: [['Michigan State University', 'BS', 'Electrical Engineering']], certs: ['Rockwell Automation Certified'], tags: ['manufacturing', 'automation'] },
  ux: { key: 'ux', titles: ['Senior Product Designer', 'Product Designer', 'UX Designer'], skills: ['Figma', 'Design Systems', 'UX Research', 'Prototyping', 'Accessibility'], companies: ['Pixel Labs', 'Hooli', 'Brightside'], locations: ['San Francisco, CA', 'Remote (US)', 'London, UK'], schools: [['RISD', 'BFA', 'Industrial Design'], ['Parsons School of Design', 'BFA', 'Communication Design']], certs: ['NN/g UX Certification'], tags: ['design'] },
};

const NAMES = `Jordan Ellis;Maya Patel;Lucas Romero;Aisha Bello;Ethan Brooks;Sofia Martinez;Noah Kim;Hannah Okoye;Liam O'Connor;Priyanka Iyer;
Mateo Alvarez;Chloe Dubois;Arjun Mehta;Grace Liu;Daniel Cohen;Fatima Khan;Oliver Wright;Yuki Tanaka;Samuel Adeyemi;Isabella Rossi;
Benjamin Clark;Leila Haddad;Ravi Kumar;Emily Turner;Kwame Mensah;Ana Silva;Jack Thompson;Mei Chen;Diego Herrera;Zara Ahmed;
Ryan Murphy;Nadia Petrova;Vikram Singh;Olivia Brown;Tomás García;Sara Johansson;Andre Williams;Lina Nguyen;Marco Bianchi;Ifeoma Nwosu;
Kevin Zhang;Rachel Adams;Hiroshi Sato;Camila Torres;Elijah Scott;Anjali Rao;Patrick Byrne;Ingrid Larsen;Omar Farouk;Jasmine Lee;
Victor Moreau;Amara Diallo;Sean Gallagher;Rosa Delgado;Aditya Joshi;Megan Foster;Juan Ortiz;Kateryna Bondar;Tyler Reed;Nisha Reddy;
Gabriel Costa;Hana Yoshida;Caleb Ward;Esther Mwangi;Felix Wagner;Lauren Mitchell;Sanjay Pillai;Aaliyah Jackson;Henrik Nilsson;Paula Santos;
Derek Huang;Simone Laurent;Kofi Asante;Natalie Price;Rohan Desai;Elena Volkova;Marcus Bennett;Ayesha Siddiqui`
  .split(';')
  .map((s) => s.trim());

// Cluster per candidate index (78 people). Order matters: scenarios below reference these indexes.
const CLUSTER_PLAN: string[] = [
  ...Array(9).fill('fe'), //  0-8
  ...Array(7).fill('be'), //  9-15
  ...Array(8).fill('de'), // 16-23
  ...Array(7).fill('ml'), // 24-30
  ...Array(5).fill('ops'), // 31-35
  ...Array(7).fill('fin'), // 36-42
  ...Array(7).fill('rn'), // 43-49
  ...Array(4).fill('hit'), // 50-53
  ...Array(5).fill('ecom'), // 54-58
  ...Array(5).fill('qa'), // 59-63
  ...Array(6).fill('mech'), // 64-69
  ...Array(5).fill('ctrl'), // 70-74
  ...Array(3).fill('ux'), // 75-77
];

const SOURCES = ['PORTAL', 'LINKEDIN', 'REFERRAL', 'JOB_BOARD', 'WEBSITE', 'AGENCY', 'IMPORT', 'OTHER'] as const;
const WORK_AUTH = ['CITIZEN', 'PERMANENT_RESIDENT', 'H1B', 'OPT', 'CPT', 'TN', 'L1', 'EAD', 'NEEDS_SPONSORSHIP', 'OTHER'] as const;
const STAFF_KEYS: StaffKey[] = ['alex', 'priya', 'marcus', 'elena'];
const nm = (i: number) => NAMES[i];

function currencyFor(location: string): string {
  if (/India/.test(location)) return 'INR';
  if (/Germany/.test(location)) return 'EUR';
  if (/UK/.test(location)) return 'GBP';
  if (/Canada/.test(location)) return 'CAD';
  return 'USD';
}

function buildCandidate(i: number) {
  const cl = C[CLUSTER_PLAN[i]];
  const [firstName, ...rest] = NAMES[i].split(' ');
  const lastName = rest.join(' ');
  const location = cl.locations[i % cl.locations.length];
  const years = 2 + ((i * 7) % 13) + (i % 3 === 0 ? 0.5 : 0);
  const currency = currencyFor(location);
  const usd = 70000 + ((i * 3517) % 90000);
  const fx = currency === 'INR' ? 30 : currency === 'EUR' ? 0.92 : currency === 'GBP' ? 0.79 : currency === 'CAD' ? 1.36 : 1;
  const slug = `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z.]/g, '');

  // Employment: current role + 1–2 prior, consistent with years of experience.
  const companies = pickN(cl.companies, Math.min(3, cl.companies.length));
  const totalMonths = Math.round(years * 12);
  const currentMonths = Math.max(8, Math.round(totalMonths * 0.45));
  const currentlyWorking = i % 11 !== 5; // a few between jobs
  const history: any[] = [];
  let cursor = currentlyWorking ? now.getTime() : now.getTime() - 4 * 30 * DAY;
  const firstStart = new Date(cursor - currentMonths * 30 * DAY);
  history.push({ company: companies[0], title: cl.titles[i % cl.titles.length], startDate: ym(firstStart), endDate: currentlyWorking ? undefined : ym(new Date(cursor)), current: currentlyWorking });
  cursor = firstStart.getTime() - 30 * DAY;
  let remaining = totalMonths - currentMonths;
  for (let k = 1; k < companies.length && remaining > 6; k++) {
    const len = k === companies.length - 1 ? remaining : Math.round(remaining * 0.6);
    const start = new Date(cursor - len * 30 * DAY);
    history.push({ company: companies[k], title: cl.titles[(i + k) % cl.titles.length].replace('Senior ', ''), startDate: ym(start), endDate: ym(new Date(cursor)), current: false });
    cursor = start.getTime() - 30 * DAY;
    remaining -= len;
  }
  const gradYear = new Date(cursor).getFullYear();
  const school = cl.schools[i % cl.schools.length];
  const education = [{ institution: school[0], degree: school[1], field: school[2], startYear: gradYear - 4, endYear: gradYear }];
  if (i % 9 === 0) education.unshift({ institution: pick(['Stanford University', 'Columbia University', 'Purdue University']), degree: 'MS', field: school[2], startYear: gradYear + 1, endYear: gradYear + 3 });

  // Certifications: include an expiring-soon and an already-expired one across the dataset.
  const certifications = cl.certs.slice(0, 1 + (i % 2)).map((name, k) => {
    const issued = ago(400 + i * 5);
    const expires = i % 13 === 0 && k === 0 ? at(20) : i % 17 === 0 && k === 0 ? ago(15) : at(400 + i);
    return { name, issuer: name.split(' ')[0], issuedAt: dateOnly(issued), expiresAt: /License|BLS|ACLS|CCRN|AWS|Kubernetes|Terraform/.test(name) ? dateOnly(expires) : undefined };
  });

  const skills = pickN(cl.skills, Math.min(cl.skills.length, 5 + (i % 4)));
  const languages = ['English', ...(i % 4 === 1 ? ['Spanish'] : []), ...(/India/.test(location) ? ['Hindi'] : []), ...(i % 10 === 3 ? ['Mandarin'] : []), ...(i % 12 === 7 ? ['French'] : [])];
  const availableIn = [0, -10, 14, 30, 45, 60][i % 6];

  return {
    firstName,
    lastName,
    email: i % 19 === 4 ? null : `${slug}@${['gmail.com', 'outlook.com', 'proton.me', 'yahoo.com'][i % 4]}`, // a few LinkedIn-only, no email
    phone: currency === 'INR' ? `+91 98${String(10000000 + i * 7919).slice(0, 8)}` : `+1 (${200 + (i % 700)}) 555-${String(1000 + i * 37).slice(-4)}`,
    currentlyWorking,
    currentTitle: history[0].title,
    currentCompany: history[0].company,
    location,
    skills,
    linkedinUrl: `https://www.linkedin.com/in/${slug.replace('.', '-')}-${100 + i}`,
    website: i % 5 === 0 ? `https://${slug.replace('.', '')}.dev` : null,
    notes: i % 6 === 0 ? `Met at ${pick(['a meetup', 'a referral call', 'a career fair'])}. ${pick(['Strong communicator.', 'Wants remote-first.', 'Open to relocation.', 'Prefers contract roles.'])}` : null,
    noticePeriod: [0, 15, 30, 45, 60, 90][i % 6],
    source: SOURCES[i % SOURCES.length],
    yearsExperience: years,
    education,
    certifications,
    employmentHistory: history,
    languages,
    currentCtc: Math.round(usd * fx),
    expectedCtc: Math.round(usd * fx * 1.18),
    ctcCurrency: currency,
    availableFrom: dateOnly(at(availableIn)),
    workAuthorization: WORK_AUTH[i % WORK_AUTH.length],
    tags: [...cl.tags.slice(0, 1 + (i % 2)), ...(i % 7 === 0 ? ['hot'] : []), ...(i % 10 === 9 ? ['re-engage'] : [])],
    ownerKey: i % 8 === 7 ? null : STAFF_KEYS[i % 4],
    lastContactedAt: i % 5 === 0 ? null : ago(1 + ((i * 3) % 40)),
    globalStatus: 'OPEN',
    status: 'LOOKING',
    clientRating: null as number | null,
  };
}

// ---------------------------------------------------------------------------
// Pipeline scenarios: every stage, timing and edge case is placed on purpose.
// ---------------------------------------------------------------------------

type Stage = 'APPLIED' | 'SCREENING' | 'SUBMITTED' | 'SHORTLISTED' | 'INTERVIEW' | 'OFFER' | 'HIRED' | 'REJECTED';
interface IvSpec {
  round: number;
  day: number; // offset from today (negative = past)
  hour?: number;
  mode?: 'VIDEO' | 'PHONE' | 'ONSITE';
  status?: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  scorecards?: { by: 'staff' | 'client'; rec: 'STRONG_NO' | 'NO' | 'YES' | 'STRONG_YES'; base: number }[];
  legacyFeedback?: string;
}
interface Scenario {
  c: number;
  job: string;
  stage: Stage;
  inStage: number; // days since stage changed
  applied?: number; // days since applied (defaults to inStage + a bit)
  submitted?: number; // days since submitted to client
  viewed?: number | null; // days since client viewed; null = never
  note?: string;
  rejection?: [string, string?];
  iv?: IvSpec[];
  offer?: { status: 'EXTENDED' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN'; amount: number; currency?: string; rate?: 'ANNUAL' | 'HOURLY'; expires?: number; start?: number; responded?: number };
  placement?: { status: 'ACTIVE' | 'COMPLETED' | 'TERMINATED'; start: number; end?: number; bill?: number; pay?: number; fee?: number; guarantee?: number; notes?: string };
  feedback?: { by: 'staff' | 'client'; text: string; rating?: number }[];
}

const S: Scenario[] = [
  // ---- TechCorp · Senior Frontend (busy, healthy role) ----
  { c: 0, job: 'tc-fe', stage: 'SUBMITTED', inStage: 0, submitted: 0, viewed: null, note: '7 yrs React/TS, led a design system at Northwind. Available in 2 weeks.' },
  { c: 1, job: 'tc-fe', stage: 'SUBMITTED', inStage: 6, submitted: 6, viewed: null, note: 'Strong Next.js + GraphQL; currently at Pixel Labs.' },
  { c: 2, job: 'tc-fe', stage: 'SUBMITTED', inStage: 4, submitted: 4, viewed: 2, note: 'Solid TypeScript; less design-system depth.', feedback: [{ by: 'client', text: 'Portfolio looks strong. Want to confirm testing depth before shortlisting.', rating: 4 }] },
  {
    c: 3, job: 'tc-fe', stage: 'INTERVIEW', inStage: 6, submitted: 14, viewed: 13, note: 'Excellent fit on paper; ex-Hooli.',
    iv: [
      { round: 1, day: -6, mode: 'VIDEO', status: 'COMPLETED', scorecards: [{ by: 'staff', rec: 'STRONG_YES', base: 5 }, { by: 'client', rec: 'YES', base: 4 }], legacyFeedback: 'Great React fundamentals; clear communicator.' },
      { round: 2, day: 0, hour: 15, mode: 'VIDEO', status: 'SCHEDULED' },
    ],
  },
  { c: 4, job: 'tc-fe', stage: 'SHORTLISTED', inStage: 2, submitted: 8, viewed: 7, note: 'Strong testing culture.' },
  {
    c: 5, job: 'tc-fe', stage: 'OFFER', inStage: 3, submitted: 25, viewed: 24,
    iv: [{ round: 1, day: -18, status: 'COMPLETED', scorecards: [{ by: 'client', rec: 'STRONG_YES', base: 5 }] }, { round: 2, day: -10, mode: 'ONSITE', status: 'COMPLETED', scorecards: [{ by: 'client', rec: 'YES', base: 4 }, { by: 'staff', rec: 'YES', base: 4 }] }],
    offer: { status: 'EXTENDED', amount: 152000, expires: 2, start: 21 },
  },
  { c: 6, job: 'tc-fe', stage: 'SCREENING', inStage: 7 }, // stuck in screening
  { c: 7, job: 'tc-fe', stage: 'APPLIED', inStage: 1 },
  { c: 9, job: 'tc-fe', stage: 'REJECTED', inStage: 5, submitted: 9, viewed: 8, rejection: ['SKILLS_MISMATCH', 'Mostly backend; no React production experience.'] },

  // ---- TechCorp · Backend (Java) ----
  {
    c: 10, job: 'tc-be', stage: 'HIRED', inStage: 0, submitted: 30, viewed: 29, // hired today → digest "Wins"
    iv: [{ round: 1, day: -20, status: 'COMPLETED', scorecards: [{ by: 'client', rec: 'STRONG_YES', base: 5 }] }],
    offer: { status: 'ACCEPTED', amount: 165000, start: 14, responded: 0 },
    placement: { status: 'ACTIVE', start: 14, fee: 33000, guarantee: 90 },
  },
  { c: 11, job: 'tc-be', stage: 'INTERVIEW', inStage: 3, submitted: 10, viewed: 9, iv: [{ round: 1, day: -3, mode: 'VIDEO', status: 'SCHEDULED' }] }, // happened, outcome not recorded → "scorecard missing"
  { c: 12, job: 'tc-be', stage: 'SCREENING', inStage: 2 },
  { c: 13, job: 'tc-be', stage: 'SUBMITTED', inStage: 2, submitted: 2, viewed: 1 },
  { c: 14, job: 'tc-be', stage: 'REJECTED', inStage: 6, submitted: 11, viewed: 10, rejection: ['COMPENSATION', 'Expecting 30% above band.'] },
  { c: 15, job: 'tc-be', stage: 'APPLIED', inStage: 0 },
  { c: 3, job: 'tc-be', stage: 'REJECTED', inStage: 20, rejection: ['EXPERIENCE_LEVEL', 'Not enough backend depth for this role; kept on frontend.'] }, // same person on two roles

  // ---- TechCorp · DevOps (new today-ish, unassigned, not analysed) ----
  { c: 31, job: 'tc-devops', stage: 'APPLIED', inStage: 0 },
  { c: 32, job: 'tc-devops', stage: 'SCREENING', inStage: 0 },

  // ---- TechCorp · Product Designer (on hold) ----
  { c: 75, job: 'tc-design', stage: 'SHORTLISTED', inStage: 30, submitted: 40, viewed: 38 },
  { c: 76, job: 'tc-design', stage: 'REJECTED', inStage: 35, submitted: 42, viewed: 41, rejection: ['POSITION_FILLED', 'Role paused; candidate informed.'] },

  // ---- FinanceGroup · Senior Financial Analyst (AT RISK: open 35d, last submission 12d ago) ----
  { c: 36, job: 'fg-fa', stage: 'SUBMITTED', inStage: 12, submitted: 12, viewed: 10 },
  { c: 37, job: 'fg-fa', stage: 'INTERVIEW', inStage: 15, submitted: 20, viewed: 19, iv: [{ round: 1, day: -14, mode: 'PHONE', status: 'COMPLETED', scorecards: [{ by: 'client', rec: 'NO', base: 3 }, { by: 'staff', rec: 'YES', base: 4 }] }] },
  { c: 38, job: 'fg-fa', stage: 'REJECTED', inStage: 18, submitted: 25, viewed: 24, rejection: ['EXPERIENCE_LEVEL', 'Too junior for board reporting.'] },
  { c: 39, job: 'fg-fa', stage: 'REJECTED', inStage: 16, submitted: 22, viewed: 21, rejection: ['CULTURE_FIT'], feedback: [{ by: 'client', text: 'Great technically but wants fully remote; we are 4 days in office.', rating: 2 }] },
  { c: 40, job: 'fg-fa', stage: 'APPLIED', inStage: 9 },
  {
    c: 41, job: 'fg-fa', stage: 'REJECTED', inStage: 8, submitted: 28, viewed: 27, rejection: ['OFFER_DECLINED', 'Accepted a counter-offer.'],
    offer: { status: 'DECLINED', amount: 138000, responded: 8 },
  },

  // ---- FinanceGroup · Data Engineer ----
  { c: 16, job: 'fg-de', stage: 'OFFER', inStage: 6, submitted: 9, viewed: 8, offer: { status: 'EXTENDED', amount: 95, rate: 'HOURLY', expires: -1, start: 10 } }, // expired offer
  // Tomorrow's interview. Also on Meridian's ML role (below): FinanceGroup's comment must never be visible to Meridian.
  { c: 17, job: 'fg-de', stage: 'INTERVIEW', inStage: 2, submitted: 5, viewed: 4, iv: [{ round: 1, day: 1, hour: 11, mode: 'ONSITE', status: 'SCHEDULED' }], feedback: [{ by: 'client', text: 'FinanceGroup internal: strong Spark, budget is tight, keep warm.', rating: 4 }] },
  { c: 18, job: 'fg-de', stage: 'SUBMITTED', inStage: 0, submitted: 0, viewed: null, note: 'Airflow + dbt in production at Ledgerline; available now.' },
  { c: 19, job: 'fg-de', stage: 'SHORTLISTED', inStage: 6, submitted: 7, viewed: 7 }, // stuck shortlisted
  { c: 20, job: 'fg-de', stage: 'REJECTED', inStage: 4, rejection: ['NO_RESPONSE', 'No reply after 3 follow-ups.'] },
  { c: 21, job: 'fg-de', stage: 'APPLIED', inStage: 2 },

  // ---- FinanceGroup · Quant Risk (CLOSED, filled) ----
  { c: 22, job: 'fg-risk', stage: 'HIRED', inStage: 120, submitted: 140, viewed: 139, offer: { status: 'ACCEPTED', amount: 110, rate: 'HOURLY', responded: 121 }, placement: { status: 'COMPLETED', start: -118, end: -5, notes: 'Contract completed; client very happy.' } },
  { c: 23, job: 'fg-risk', stage: 'REJECTED', inStage: 125, submitted: 141, viewed: 140, rejection: ['POSITION_FILLED'] },

  // ---- Meridian · ICU Nurse ----
  { c: 43, job: 'mh-rn', stage: 'INTERVIEW', inStage: 1, submitted: 4, viewed: 3, iv: [{ round: 1, day: 3, hour: 9, mode: 'PHONE', status: 'SCHEDULED' }] },
  { c: 44, job: 'mh-rn', stage: 'SUBMITTED', inStage: 2, submitted: 2, viewed: null, note: '6 yrs ICU at Bay State, CCRN.' },
  { c: 45, job: 'mh-rn', stage: 'SUBMITTED', inStage: 3, submitted: 3, viewed: 1 },
  { c: 46, job: 'mh-rn', stage: 'SCREENING', inStage: 1 },
  { c: 47, job: 'mh-rn', stage: 'REJECTED', inStage: 2, rejection: ['LOCATION', 'Will not commute from Providence.'] },
  { c: 48, job: 'mh-rn', stage: 'APPLIED', inStage: 0 },

  // ---- Meridian · Healthcare IT (new, 2 days) ----
  { c: 50, job: 'mh-hit', stage: 'APPLIED', inStage: 1 },
  { c: 51, job: 'mh-hit', stage: 'SCREENING', inStage: 0 },

  // ---- Meridian · ML Engineer ----
  { c: 24, job: 'mh-ml', stage: 'HIRED', inStage: 40, submitted: 60, viewed: 59, offer: { status: 'ACCEPTED', amount: 185000, responded: 41 }, placement: { status: 'ACTIVE', start: -30, fee: 37000, guarantee: 90 } },
  {
    c: 25, job: 'mh-ml', stage: 'INTERVIEW', inStage: 4, submitted: 20, viewed: 19,
    iv: [
      { round: 1, day: -15, status: 'COMPLETED', scorecards: [{ by: 'client', rec: 'YES', base: 4 }] },
      // Split panel: client strong-no vs recruiter strong-yes (tests the recommendation split view).
      { round: 2, day: -8, mode: 'ONSITE', status: 'COMPLETED', scorecards: [{ by: 'client', rec: 'STRONG_NO', base: 2 }, { by: 'staff', rec: 'STRONG_YES', base: 5 }] },
      { round: 3, day: 6, hour: 14, mode: 'VIDEO', status: 'SCHEDULED' },
    ],
  },
  { c: 26, job: 'mh-ml', stage: 'SUBMITTED', inStage: 8, submitted: 8, viewed: null },
  { c: 27, job: 'mh-ml', stage: 'REJECTED', inStage: 10, submitted: 15, viewed: 14, rejection: ['CANDIDATE_WITHDREW', 'Accepted an internal promotion.'] },
  { c: 28, job: 'mh-ml', stage: 'INTERVIEW', inStage: 5, submitted: 12, viewed: 11, iv: [{ round: 1, day: -5, status: 'NO_SHOW' }, { round: 1, day: 2, hour: 16, status: 'SCHEDULED' }] },
  { c: 17, job: 'mh-ml', stage: 'SCREENING', inStage: 3 }, // same person, two clients (isolation test)

  // ---- Nimbus · Ops Manager (AT RISK: open 28d, nothing submitted) ----
  { c: 54, job: 'nr-ops', stage: 'SCREENING', inStage: 10 },
  { c: 55, job: 'nr-ops', stage: 'APPLIED', inStage: 20 },
  { c: 56, job: 'nr-ops', stage: 'REJECTED', inStage: 12, rejection: ['OTHER', 'Failed reference check.'] },

  // ---- Nimbus · QA Automation (created today, not analysed) ----
  { c: 59, job: 'nr-qa', stage: 'APPLIED', inStage: 0 },

  // ---- Nimbus · Data Scientist (on hold) ----
  { c: 29, job: 'nr-ds', stage: 'SHORTLISTED', inStage: 50, submitted: 55, viewed: 54 },

  // ---- Atlas · Mechanical Design ----
  { c: 64, job: 'am-me', stage: 'INTERVIEW', inStage: 3, submitted: 8, viewed: 7, iv: [{ round: 1, day: -1, mode: 'ONSITE', status: 'CANCELLED' }, { round: 1, day: 2, hour: 10, mode: 'ONSITE', status: 'SCHEDULED' }] },
  { c: 65, job: 'am-me', stage: 'SUBMITTED', inStage: 5, submitted: 5, viewed: 3 },
  { c: 66, job: 'am-me', stage: 'OFFER', inStage: 2, submitted: 12, viewed: 11, iv: [{ round: 1, day: -6, mode: 'ONSITE', status: 'COMPLETED', scorecards: [{ by: 'client', rec: 'STRONG_YES', base: 5 }] }], offer: { status: 'EXTENDED', amount: 58, rate: 'HOURLY', expires: 10, start: 20 } },
  { c: 67, job: 'am-me', stage: 'HIRED', inStage: 200, submitted: 215, viewed: 214, offer: { status: 'ACCEPTED', amount: 92000, responded: 201 }, placement: { status: 'TERMINATED', start: -195, end: -60, notes: 'Ended early: relocated out of state.' } },
  { c: 68, job: 'am-me', stage: 'REJECTED', inStage: 7, submitted: 10, viewed: 9, rejection: ['SKILLS_MISMATCH', 'No GD&T experience.'] },

  // ---- Atlas · Controls (AT RISK: open 40d, last submission 9d ago) ----
  { c: 70, job: 'am-plc', stage: 'SUBMITTED', inStage: 9, submitted: 9, viewed: null },
  { c: 71, job: 'am-plc', stage: 'SCREENING', inStage: 6 },
  { c: 72, job: 'am-plc', stage: 'HIRED', inStage: 2, submitted: 25, viewed: 24, offer: { status: 'ACCEPTED', amount: 88, rate: 'HOURLY', responded: 3 }, placement: { status: 'ACTIVE', start: -1, guarantee: 30 } },
  { c: 73, job: 'am-plc', stage: 'OFFER', inStage: 4, submitted: 18, viewed: 17, offer: { status: 'WITHDRAWN', amount: 85, rate: 'HOURLY', responded: 1 } },

  // ---- Atlas · Supply Chain (CLOSED) ----
  { c: 57, job: 'am-sc', stage: 'HIRED', inStage: 150, submitted: 170, viewed: 169, offer: { status: 'ACCEPTED', amount: 72000, responded: 151 }, placement: { status: 'COMPLETED', start: -148, end: -20 } },
];

// Talent-pool archive states for unlinked people (re-engageable vs not).
const ARCHIVE: Record<number, string> = { 8: 'OPPORTUNITY', 30: 'CONTACTED', 33: 'NOT_INTERESTED', 42: 'BLACKLISTED', 49: 'OFFBOARDED', 63: 'OPPORTUNITY', 74: 'CONTACTED' };

// ---------------------------------------------------------------------------
// Files: résumé + JD PDFs
// ---------------------------------------------------------------------------

function writePdf(file: string, build: (doc: PDFKit.PDFDocument) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 54 });
    const out = fs.createWriteStream(file);
    doc.pipe(out);
    build(doc);
    doc.end();
    out.on('finish', resolve);
    out.on('error', reject);
  });
}

function resumeBody(doc: PDFKit.PDFDocument, c: any) {
  doc.font('Helvetica-Bold').fontSize(20).text(`${c.firstName} ${c.lastName}`);
  doc.font('Helvetica').fontSize(10).fillColor('#444').text([c.currentTitle, c.location, c.email, c.phone, c.linkedinUrl].filter(Boolean).join('  |  '));
  doc.moveDown().fillColor('#000').font('Helvetica-Bold').fontSize(12).text('Summary');
  doc.font('Helvetica').fontSize(10).text(`${c.currentTitle} with ${c.yearsExperience} years of experience. Core skills: ${c.skills.join(', ')}.`);
  doc.moveDown().font('Helvetica-Bold').fontSize(12).text('Experience');
  for (const e of c.employmentHistory) {
    doc.font('Helvetica-Bold').fontSize(10).text(`${e.title} — ${e.company}`);
    doc.font('Helvetica').fillColor('#555').text(`${e.startDate} – ${e.current ? 'Present' : e.endDate}`).fillColor('#000');
    doc.text(`• Delivered projects using ${c.skills.slice(0, 3).join(', ')}.`);
    doc.text(`• Collaborated with cross-functional teams; mentored junior colleagues.`);
    doc.moveDown(0.4);
  }
  doc.moveDown().font('Helvetica-Bold').fontSize(12).text('Education');
  for (const e of c.education) doc.font('Helvetica').fontSize(10).text(`${e.degree} ${e.field}, ${e.institution} (${e.startYear}–${e.endYear})`);
  if (c.certifications.length) {
    doc.moveDown().font('Helvetica-Bold').fontSize(12).text('Certifications');
    for (const e of c.certifications) doc.font('Helvetica').fontSize(10).text(`${e.name}${e.issuer ? ` — ${e.issuer}` : ''}`);
  }
  doc.moveDown().font('Helvetica-Bold').fontSize(12).text('Skills');
  doc.font('Helvetica').fontSize(10).text(c.skills.join(', '));
  doc.moveDown().font('Helvetica-Bold').fontSize(12).text('Languages');
  doc.font('Helvetica').fontSize(10).text(c.languages.join(', '));
}

const DEVOPS_JD = `DevOps / Platform Engineer (Contract, Remote US)

About the team
TechCorp's Platform team runs 300+ services on Kubernetes across three AWS regions.

What you'll do
- Own our Terraform modules and the Kubernetes platform (EKS)
- Build CI/CD pipelines and golden paths for product teams
- Improve observability with Prometheus and Grafana; join the on-call rotation

Must have
- 4+ years in DevOps / SRE / platform roles
- Kubernetes, Terraform, AWS, Docker, CI/CD, Linux

Nice to have
- Python or Go scripting, Prometheus, CKA certification`;

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function wipe() {
  const tables = AppDataSource.entityMetadatas.map((m) => `"${m.tableName}"`).join(', ');
  await AppDataSource.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  for (const dir of [RESUME_DIR, JOB_DESCRIPTION_DIR, CANDIDATE_PHOTO_DIR]) {
    for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { force: true });
  }
}

async function seed() {
  (AppDataSource.options as any).logging = false;
  await AppDataSource.initialize();
  console.log('[seed:demo] wiping data…');
  await wipe();

  const repo = <T>(e: new () => T) => AppDataSource.getRepository(e as any) as any;
  const save = <T>(e: new () => T, data: any) => repo(e).save(repo(e).create(data));

  // ---- Users, orgs, memberships ----
  const staff: Record<StaffKey, User> = {} as any;
  for (const s of STAFF) staff[s.key] = await save(User, { email: s.email, name: s.name, lastLoginAt: ago(s.key === 'alex' ? 0 : 1) });

  const orgs: Record<string, Organization> = {};
  const clientUsers: Record<string, User[]> = {};
  for (const o of ORGS) {
    const { users, contacts, ...data } = o as any;
    orgs[o.slug] = await save(Organization, { ...data, contacts });
    clientUsers[o.slug] = [];
    for (const u of users) {
      const user = await save(User, { email: u.email, name: u.name, lastLoginAt: ago(2) });
      await save(OrganizationMembership, { organization: orgs[o.slug], user, role: 'CLIENT' });
      clientUsers[o.slug].push(user);
    }
  }
  // Staff work across every client; their membership row just carries the ADMIN role.
  for (const s of STAFF) await save(OrganizationMembership, { organization: orgs.org_techcorp, user: staff[s.key], role: 'ADMIN' });

  // ---- Jobs ----
  const jobs: Record<string, Job> = {};
  for (const j of JOBS) {
    const job: any = await save(Job, {
      organization: orgs[j.org],
      title: j.title,
      department: j.department,
      location: j.location,
      status: j.status,
      priority: j.priority,
      workType: j.workType,
      payrollType: j.payrollType,
      payRate: j.pay,
      billRate: j.bill,
      billableHours: j.hours,
      description: j.description,
      openedAt: ago(j.openedDaysAgo, 9),
      owner: j.owner ? staff[j.owner] : null,
      aiSummary: j.ai?.summary ?? null,
      aiRequirements: j.ai
        ? { mustHaveSkills: j.ai.must, niceToHaveSkills: j.ai.nice, titles: j.ai.titles, minYears: j.ai.minYears, location: j.location, remote: !!j.ai.remote, method: 'ai' }
        : null,
      aiAnalyzedAt: j.ai ? ago(j.openedDaysAgo, 9) : null,
    });
    // createdAt drives "new roles"; backdate it to match openedAt.
    await AppDataSource.query(`UPDATE jobs SET "createdAt" = $2 WHERE id = $1`, [job.id, ago(j.openedDaysAgo, 9)]);
    if (j.jdFile) {
      const stored = `${crypto.randomUUID()}.pdf`;
      await writePdf(path.join(JOB_DESCRIPTION_DIR, stored), (doc) => doc.font('Helvetica').fontSize(11).text(DEVOPS_JD));
      await repo(Job).update(job.id, { jdUrl: stored, jdFileName: 'TechCorp - DevOps Platform Engineer JD.pdf' });
    }
    jobs[j.key] = job;
  }

  // ---- Candidates ----
  const specs = CLUSTER_PLAN.map((_, i) => buildCandidate(i));
  const linked = new Set(S.map((s) => s.c));
  const cands: Candidate[] = [];
  for (let i = 0; i < specs.length; i++) {
    const { ownerKey, ...data } = specs[i] as any;
    if (ARCHIVE[i] && !linked.has(i)) {
      data.globalStatus = 'ARCHIVED';
      data.status = ARCHIVE[i];
    }
    if (i % 4 === 2) data.clientRating = 3 + (i % 3);
    cands.push(await save(Candidate, { ...data, owner: ownerKey ? staff[ownerKey as StaffKey] : null }));
  }
  // Deliberate duplicates (duplicate finder, import preview): same phone / same email, different spelling.
  const dupOf = (i: number, patch: any) => {
    const { ownerKey, ...base } = specs[i] as any;
    return save(Candidate, { ...base, ...patch, owner: staff.alex, source: 'IMPORT', tags: ['possible-duplicate'], employmentHistory: base.employmentHistory.slice(0, 1) });
  };
  await dupOf(0, { firstName: 'Jordan', lastName: 'Ellis', email: 'j.ellis.work@gmail.com', linkedinUrl: null }); // same phone as #0
  await dupOf(40, { firstName: 'Kevin', lastName: 'Zhang', email: specs[40].email?.toUpperCase() ?? null, phone: '+1 (999) 555-0000' }); // same email, different case

  // Résumés (PDF) for ~2/3 of candidates, photos for a few (generated avatars).
  for (let i = 0; i < cands.length; i++) {
    if (i % 3 === 2) continue;
    const stored = `${crypto.randomUUID()}.pdf`;
    await writePdf(path.join(RESUME_DIR, stored), (doc) => resumeBody(doc, specs[i]));
    await repo(Candidate).update(cands[i].id, { resumeUrl: stored, resumeFileName: `${specs[i].firstName}_${specs[i].lastName}_Resume.pdf`.replace(/\s+/g, '_') });
  }
  const photoDir = path.join(__dirname, '../../../demo-files/photos');
  if (fs.existsSync(photoDir)) {
    const photos = fs.readdirSync(photoDir).filter((f) => f.endsWith('.jpg')).sort();
    for (let k = 0; k < photos.length; k++) {
      const i = k * 5; // spread across the list
      if (!cands[i]) break;
      const stored = `${crypto.randomUUID()}.jpg`;
      fs.copyFileSync(path.join(photoDir, photos[k]), path.join(CANDIDATE_PHOTO_DIR, stored));
      await repo(Candidate).update(cands[i].id, { photoUrl: stored, photoFileName: photos[k] });
    }
  }

  // ---- Applications + interviews + scorecards + offers + placements ----
  const staffEmail = (j: JobSpec) => staff[j.owner ?? 'alex'].email;
  const clientOf = (j: JobSpec) => clientUsers[j.org][0];
  const apps: Record<string, Application> = {};
  for (const sc of S) {
    const jspec = JOBS.find((j) => j.key === sc.job)!;
    const job = jobs[sc.job];
    const cand = cands[sc.c];
    const appliedDays = sc.applied ?? Math.max(sc.inStage, sc.submitted ?? 0) + 2 + (sc.c % 4);
    const app: any = await save(Application, {
      candidate: cand,
      job,
      stage: sc.stage,
      stageUpdatedAt: ago(sc.inStage, 11),
      appliedAt: ago(appliedDays, 9),
      interviewRound: sc.iv ? Math.max(...sc.iv.map((v) => v.round)) : 0,
      submittedAt: sc.submitted != null ? ago(sc.submitted, 10) : null,
      submittedByEmail: sc.submitted != null ? staffEmail(jspec) : null,
      submissionNote: sc.note ?? null,
      clientViewedAt: sc.viewed != null ? ago(sc.viewed, 14) : null,
      rejectionReason: sc.rejection?.[0] ?? null,
      rejectionNote: sc.rejection?.[1] ?? null,
    });
    apps[`${sc.c}:${sc.job}`] = app;
    await repo(Job).increment({ id: job.id }, 'totalCandidates', 1);

    for (const iv of sc.iv ?? []) {
      const client = clientOf(jspec);
      await save(Interview, {
        application: app,
        round: iv.round,
        scheduledAt: at(iv.day, iv.hour ?? 10),
        durationMinutes: iv.mode === 'ONSITE' ? 90 : 45,
        mode: iv.mode ?? 'VIDEO',
        location: (iv.mode ?? 'VIDEO') === 'VIDEO' ? `https://meet.google.com/${['abc-defg-hij', 'kpt-wxyz-qrs', 'mno-pqrs-tuv'][iv.round % 3]}` : (iv.mode === 'ONSITE' ? `${ORGS.find((o) => o.slug === jspec.org)!.hq} office, Floor 4` : undefined),
        interviewers: `${client?.name ?? 'Hiring manager'}${iv.round > 1 ? ', Panel lead' : ''}`,
        status: iv.status ?? 'SCHEDULED',
        notes: iv.status === 'CANCELLED' ? 'Cancelled by client: hiring manager travelling. Rescheduled.' : iv.status === 'NO_SHOW' ? 'Candidate did not join; reached later, family emergency. Rebooked.' : null,
        createdByEmail: staffEmail(jspec),
      });
      for (const card of iv.scorecards ?? []) {
        const author = card.by === 'client' ? client : staff[jspec.owner ?? 'alex'];
        await save(InterviewScorecard, {
          application: app,
          round: iv.round,
          authorEmail: author.email,
          authorName: author.name,
          authorRole: card.by === 'client' ? 'CLIENT' : 'ADMIN',
          recommendation: card.rec,
          ratings: SCORECARD_CRITERIA.map((cr, k) => ({
            key: cr.key,
            label: cr.label,
            score: k === 5 && card.by === 'client' ? null : Math.max(1, Math.min(5, card.base + ((k % 3) - 1))),
            comment: k === 0 ? (card.base >= 4 ? 'Strong depth in the core stack.' : 'Gaps in core skills for this level.') : undefined,
          })),
          summary: card.rec.includes('YES') ? 'Recommend moving forward.' : 'Not a fit for this level right now.',
        });
      }
      if (iv.legacyFeedback) {
        await save(InterviewFeedback, { application: app, round: iv.round, authorEmail: client.email, authorRole: 'CLIENT', comment: iv.legacyFeedback, rating: 4 });
      }
    }

    if (sc.offer) {
      const o = sc.offer;
      await save(Offer, {
        application: app,
        amount: o.amount,
        currency: o.currency ?? 'USD',
        rateType: o.rate ?? 'ANNUAL',
        startDate: o.start != null ? dateOnly(at(o.start)) : null,
        expiresAt: o.expires != null ? dateOnly(at(o.expires)) : null,
        status: o.status,
        notes: o.status === 'WITHDRAWN' ? 'Client re-scoped the role to a different shift pattern.' : null,
        createdByEmail: staffEmail(jspec),
        respondedAt: o.responded != null ? ago(o.responded, 16) : null,
      });
    }
    if (sc.placement) {
      const p = sc.placement;
      await save(Placement, {
        application: app,
        startDate: dateOnly(at(p.start)),
        endDate: p.end != null ? dateOnly(at(p.end)) : null,
        billRate: p.bill ?? jspec.bill,
        payRate: p.pay ?? jspec.pay,
        fee: p.fee ?? null,
        guaranteeDays: p.guarantee ?? null,
        status: p.status,
        notes: p.notes ?? null,
        createdByEmail: staffEmail(jspec),
      });
    }
    for (const fb of sc.feedback ?? []) {
      const author = fb.by === 'client' ? clientOf(jspec) : staff[jspec.owner ?? 'alex'];
      await save(CandidateFeedback, { candidate: cand, authorEmail: author.email, authorRole: fb.by === 'client' ? 'CLIENT' : 'ADMIN', comment: fb.text, rating: fb.rating });
    }
  }

  // Candidate global status follows their furthest active outcome.
  for (const sc of S) {
    const cand = cands[sc.c];
    const jspec = JOBS.find((j) => j.key === sc.job)!;
    if (sc.stage === 'OFFER' && sc.offer?.status === 'EXTENDED') await repo(Candidate).update(cand.id, { globalStatus: 'SELECTED', status: 'SELECTED' });
    if (sc.stage === 'HIRED') {
      const active = sc.placement?.status === 'ACTIVE';
      await repo(Candidate).update(cand.id, active ? { globalStatus: 'ONBOARDED', status: jspec.payrollType === 'IN_HOUSE' ? 'COMPANY' : 'SWFS' } : { globalStatus: 'ARCHIVED', status: 'OFFBOARDED' });
    }
  }
  // A follow-up target: active candidate nobody has called in weeks.
  for (const c of [1, 26, 36, 54, 70]) await repo(Candidate).update(cands[c].id, { lastContactedAt: ago(20 + c % 10) });

  // ---- Notes (all kinds, all record types, with @mentions) ----
  const note = (recordType: string, recordId: string, kind: string, by: StaffKey, body: string, daysAgo: number, mentions: StaffKey[] = []) =>
    save(RecordNote, { recordType, recordId, kind, body, author: staff[by], authorEmail: staff[by].email, occurredAt: ago(daysAgo, 12), mentions: mentions.map((m) => staff[m].id) });
  await note('candidate', cands[3].id, 'CALL', 'priya', 'Prep call for round 2. Walked through the design-system case study. Feels confident.', 1);
  await note('candidate', cands[3].id, 'NOTE', 'priya', '@Alex Morgan can you join the debrief with David after round 2?', 0, ['alex']);
  await note('candidate', cands[5].id, 'EMAIL', 'priya', 'Sent offer summary and benefits guide. Candidate will reply by Friday.', 3);
  await note('candidate', cands[16].id, 'FOLLOW_UP', 'marcus', 'Offer expired yesterday. Need a decision on extending. @Elena Garcia FYI.', 0, ['elena']);
  await note('candidate', cands[10].id, 'MEETING', 'marcus', 'Signed offer. Start date confirmed; sent onboarding pack.', 0);
  await note('candidate', cands[36].id, 'NOTE', 'elena', 'Client viewed 10 days ago, no decision. @Alex Morgan escalate on Tuesday sync?', 2, ['alex']);
  await note('candidate', cands[44].id, 'CALL', 'elena', 'CCRN confirmed, 6 years ICU. Can start in 3 weeks.', 2);
  await note('candidate', cands[70].id, 'EMAIL', 'marcus', 'Chased Atlas for feedback on submission.', 4);
  await note('job', jobs['tc-fe'].id, 'MEETING', 'priya', 'Intake with David Park: design-system ownership is the #1 must-have. Max 3 submissions/week.', 20);
  await note('job', jobs['fg-fa'].id, 'NOTE', 'elena', 'Pipeline is thin. Expanding search to Hoboken/Stamford and CFA charterholders. @Priya Shah any finance referrals?', 6, ['priya']);
  await note('job', jobs['am-plc'].id, 'CALL', 'marcus', 'Luis says Allen-Bradley is non-negotiable; Siemens-only candidates are out.', 30);
  await note('job', jobs['tc-devops'].id, 'NOTE', 'alex', 'New role from TechCorp. Needs an owner. @Marcus Lee can you take it?', 0, ['marcus']);
  await note('organization', orgs.org_techcorp.id, 'MEETING', 'alex', 'QBR with Sarah and Mark: happy with quality, want faster time-to-submit on frontend.', 15);
  await note('organization', orgs.org_financegroup.id, 'EMAIL', 'elena', 'Sent revised fee schedule for contract-to-hire conversions.', 9);
  await note('organization', orgs.org_heliosenergy.id, 'CALL', 'alex', 'Kick-off call: first two roles (Project Engineer, Site Manager) expected next month.', 3);
  await note('organization', orgs.org_meridianhealth.id, 'FOLLOW_UP', 'priya', 'Follow up on Epic upgrade timeline: more analyst roles may open.', 1);

  // ---- Tasks (all priorities/statuses/recurrences; overdue, today, this week, later, none) ----
  const task = (title: string, assignee: StaffKey, by: StaffKey, dueDays: number | null, priority: string, extra: any = {}) =>
    save(Task, { title, assignee: staff[assignee], createdBy: staff[by], dueAt: dueDays == null ? null : at(dueDays, 17), priority, status: 'OPEN', recurrence: 'NONE', ...extra });
  await task(`Chase TechCorp feedback on ${nm(2)}`, 'alex', 'priya', -3, 'HIGH', { recordType: 'candidate', recordId: cands[2].id, description: 'Client viewed 2 days ago; nudge David.' });
  await task(`Confirm round-2 logistics with ${nm(3)}`, 'alex', 'alex', 0, 'MEDIUM', { recordType: 'candidate', recordId: cands[3].id });
  await task(`Decide on expired offer: ${nm(16)}`, 'marcus', 'marcus', 0, 'HIGH', { recordType: 'candidate', recordId: cands[16].id });
  await task('Source 5 more FP&A candidates', 'elena', 'alex', 2, 'HIGH', { recordType: 'job', recordId: jobs['fg-fa'].id });
  await task('Assign owner + kick off DevOps role', 'alex', 'alex', 1, 'MEDIUM', { recordType: 'job', recordId: jobs['tc-devops'].id });
  await task('Prep QBR deck for Meridian', 'priya', 'alex', 6, 'LOW', { recordType: 'organization', recordId: orgs.org_meridianhealth.id });
  await task('Update LinkedIn recruiter templates', 'priya', 'priya', null, 'LOW');
  await task('Weekly pipeline review with FinanceGroup', 'elena', 'elena', 4, 'MEDIUM', { recurrence: 'WEEKLY', recordType: 'organization', recordId: orgs.org_financegroup.id });
  await task('Check new LinkedIn applicants', 'marcus', 'marcus', 0, 'LOW', { recurrence: 'DAILY' });
  await task('Monthly invoice reconciliation', 'alex', 'alex', 12, 'MEDIUM', { recurrence: 'MONTHLY' });
  await task(`Reference check: ${nm(10)}`, 'alex', 'marcus', -1, 'MEDIUM', { recordType: 'candidate', recordId: cands[10].id, status: 'DONE', completedAt: ago(0, 9) });
  await task(`Send onboarding pack to ${nm(72)}`, 'marcus', 'marcus', -2, 'MEDIUM', { recordType: 'candidate', recordId: cands[72].id, status: 'DONE', completedAt: ago(1, 15) });
  await task('Re-engage archived ML candidates for Meridian', 'marcus', 'alex', 3, 'MEDIUM', { recordType: 'job', recordId: jobs['mh-ml'].id });
  await task(`Call ${nm(7)} about the frontend role`, 'alex', 'alex', -6, 'LOW', { recordType: 'candidate', recordId: cands[7].id });

  // ---- Saved searches ----
  const saved = (by: StaffKey, name: string, params: Record<string, string>) => save(SavedSearch, { user: staff[by], name, params });
  await saved('alex', 'Senior React in Texas', { skills: 'React', location: 'TX', minExperience: '5' });
  await saved('alex', 'Re-engage: archived but reachable', { globalStatus: 'ARCHIVED', tags: 're-engage' });
  await saved('alex', 'Available now, no sponsorship needed', { availableBy: dateOnly(now), workAuthorization: 'CITIZEN,PERMANENT_RESIDENT' });
  await saved('marcus', 'Spark + Airflow data engineers', { q: 'Spark AND Airflow' });
  await saved('elena', 'ICU nurses, 30d notice max', { skills: 'ICU', maxNoticePeriod: '30' });
  await saved('priya', 'Match: Senior Frontend JD 60%+', { matchJobId: jobs['tc-fe'].id, minMatch: '60' });

  // ---- Notifications (read + unread, staff + clients) ----
  const notify = (user: User, type: string, title: string, body: string, link: string, hoursAgo: number, read = false, actorName = 'SWFS') =>
    AppDataSource.query(
      `INSERT INTO notifications ("recipientId", type, title, body, link, "actorName", "readAt", "createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [user.id, type, title, body, link, actorName, read ? new Date(now.getTime() - (hoursAgo - 1) * 3600000) : null, new Date(now.getTime() - hoursAgo * 3600000)]
    );
  const sarah = clientUsers.org_techcorp[0];
  const jennifer = clientUsers.org_financegroup[0];
  await notify(staff.alex, 'CLIENT_SHORTLISTED', `Sarah Chen shortlisted ${nm(4)}`, 'Senior Frontend Engineer', `/candidates/${cands[4].id}`, 48, false, 'Sarah Chen');
  await notify(staff.alex, 'CLIENT_VIEWED', `Jennifer Walsh opened ${nm(36)}`, 'Senior Financial Analyst', `/candidates/${cands[36].id}`, 240, true, 'Jennifer Walsh');
  await notify(staff.alex, 'MENTION', 'Priya Shah mentioned you', 'Can you join the debrief with David after round 2?', `/candidates/${cands[3].id}`, 2, false, 'Priya Shah');
  await notify(staff.alex, 'TASK_ASSIGNED', `New task: Chase TechCorp feedback on ${nm(2)}`, 'Due 3 days ago', '/my-work', 96, false, 'Priya Shah');
  await notify(staff.alex, 'CLIENT_NEW_ROLE', 'Sarah Chen opened a new role', 'DevOps / Platform Engineer', `/jobs/${jobs['tc-devops'].id}`, 24, false, 'Sarah Chen');
  await notify(staff.marcus, 'CLIENT_NEW_ROLE', 'Omar Haddad opened a new role', 'QA Automation Engineer', `/jobs/${jobs['nr-qa'].id}`, 3, false, 'Omar Haddad');
  await notify(staff.elena, 'CLIENT_REJECTED', `Jennifer Walsh rejected ${nm(39)}`, 'Culture fit · Senior Financial Analyst', `/candidates/${cands[39].id}`, 380, true, 'Jennifer Walsh');
  await notify(sarah, 'CANDIDATE_SUBMITTED', 'New candidate for Senior Frontend Engineer', `${nm(0)} was submitted by Priya Shah`, `/candidates/${cands[0].id}`, 3);
  await notify(sarah, 'INTERVIEW_SCHEDULED', `Interview today: ${nm(3)}`, 'Round 2 · 3:00 PM · Video', `/candidates/${cands[3].id}`, 20);
  await notify(sarah, 'OFFER_EXTENDED', `Offer extended to ${nm(5)}`, 'Expires in 2 days', `/candidates/${cands[5].id}`, 70, true);
  await notify(sarah, 'PLACEMENT_CREATED', `${nm(10)} is placed`, 'Backend Engineer (Java)', `/candidates/${cands[10].id}`, 1);
  await notify(jennifer, 'CANDIDATE_SUBMITTED', 'New candidate for Data Engineer', `${nm(18)} was submitted by Marcus Lee`, `/candidates/${cands[18].id}`, 2);

  // ---- Activity log ----
  const log = (who: { id?: string; email: string }, action: string, entityType: string, entityId: string, details: any, hoursAgo: number, org?: Organization) =>
    AppDataSource.query(
      `INSERT INTO audit_logs ("organizationId", "userId", "userEmail", action, "entityType", "entityId", details, "ipAddress", "createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [org?.id ?? null, who.id ?? null, who.email, action, entityType, entityId, JSON.stringify(details), '10.0.0.' + (1 + (hoursAgo % 200)), new Date(now.getTime() - hoursAgo * 3600000)]
    );
  const tc = orgs.org_techcorp;
  await log(staff.priya, 'CREATE_CANDIDATE', 'candidate', cands[0].id, { source: 'LINKEDIN' }, 30, tc);
  await log(staff.priya, 'SUBMIT_TO_CLIENT', 'candidate', cands[0].id, { jobId: jobs['tc-fe'].id }, 3, tc);
  await log(sarah, 'CLIENT_VIEWED_SUBMISSION', 'candidate', cands[2].id, { jobId: jobs['tc-fe'].id }, 48, tc);
  await log(sarah, 'SHORTLIST_CANDIDATE', 'candidate', cands[4].id, { jobId: jobs['tc-fe'].id }, 48, tc);
  await log(sarah, 'CREATE_JOB', 'job', jobs['tc-devops'].id, { title: 'DevOps / Platform Engineer' }, 24, tc);
  await log(staff.marcus, 'UPDATE_STAGE', 'candidate', cands[10].id, { jobId: jobs['tc-be'].id, stage: 'HIRED' }, 1, tc);
  await log(jennifer, 'REJECT_CANDIDATE', 'candidate', cands[39].id, { reason: 'CULTURE_FIT' }, 380, orgs.org_financegroup);
  await log(staff.elena, 'UPDATE_JOB', 'job', jobs['fg-fa'].id, { priority: 'HIGH' }, 200, orgs.org_financegroup);
  await log(staff.alex, 'CREATE_ORGANIZATION', 'organization', orgs.org_heliosenergy.id, { name: 'Helios Energy' }, 72);
  await log(staff.marcus, 'SCHEDULE_INTERVIEW', 'candidate', cands[17].id, { jobId: jobs['fg-de'].id, round: 1 }, 50, orgs.org_financegroup);
  await log(staff.elena, 'EXTEND_OFFER', 'candidate', cands[66].id, { jobId: jobs['am-me'].id }, 40, orgs.org_atlasmfg);

  // ---- Upload-test files (people/roles NOT in the database) ----
  const demoDir = path.join(__dirname, '../../../demo-files');
  fs.mkdirSync(path.join(demoDir, 'resumes'), { recursive: true });
  fs.mkdirSync(path.join(demoDir, 'job-descriptions'), { recursive: true });
  await writePdf(path.join(demoDir, 'resumes', 'Zoe_Lindqvist_Senior_Frontend_Engineer.pdf'), (doc) =>
    resumeBody(doc, {
      firstName: 'Zoe',
      lastName: 'Lindqvist',
      currentTitle: 'Senior Frontend Engineer',
      location: 'Austin, TX',
      email: 'zoe.lindqvist@example.com',
      phone: '+1 (737) 555-0142',
      linkedinUrl: 'https://www.linkedin.com/in/zoe-lindqvist',
      yearsExperience: 8,
      skills: ['React', 'TypeScript', 'Next.js', 'GraphQL', 'Jest', 'Storybook', 'AWS'],
      employmentHistory: [
        { title: 'Senior Frontend Engineer', company: 'Northwind Software', startDate: '2021-04', current: true },
        { title: 'Frontend Engineer', company: 'Pixel Labs', startDate: '2018-06', endDate: '2021-03' },
        { title: 'Web Developer', company: 'Brightside', startDate: '2016-08', endDate: '2018-05' },
      ],
      education: [{ degree: 'BS', field: 'Computer Science', institution: 'University of Texas at Austin', startYear: 2012, endYear: 2016 }],
      certifications: [{ name: 'AWS Certified Developer – Associate', issuer: 'Amazon Web Services' }],
      languages: ['English', 'Swedish'],
    })
  );
  await writePdf(path.join(demoDir, 'job-descriptions', 'Nimbus_QA_Automation_JD.pdf'), (doc) =>
    doc.font('Helvetica').fontSize(11).text(`QA Automation Engineer (Contract, Remote US) — Nimbus Retail

What you'll do
- Build end-to-end automation for storefront, cart and checkout with Playwright
- Own API test suites and run them in CI/CD (GitHub Actions)
- Partner with engineers to shift testing left

Must have
- 3+ years in test automation
- Playwright or Cypress, TypeScript/JavaScript, API testing, CI/CD

Nice to have
- Performance testing (k6), Shopify experience`)
  );

  // ---- Summary ----
  const count = async (t: string) => Number((await AppDataSource.query(`SELECT COUNT(*) AS n FROM ${t}`))[0].n);
  const tables = ['organizations', 'users', 'jobs', 'candidates', 'applications', 'interviews', 'interview_scorecards', 'offers', 'placements', 'record_notes', 'tasks', 'saved_searches', 'notifications', 'audit_logs'];
  const counts: string[] = [];
  for (const t of tables) counts.push(`${t}=${await count(t)}`);
  console.log(`[seed:demo] done → ${counts.join(', ')}`);
  console.log(`[seed:demo] résumés=${fs.readdirSync(RESUME_DIR).length}, photos=${fs.readdirSync(CANDIDATE_PHOTO_DIR).length}, JD files=${fs.readdirSync(JOB_DESCRIPTION_DIR).length}`);
  await AppDataSource.destroy();
}

seed().catch(async (err) => {
  console.error('[seed:demo] failed:', err);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});

// Exported for the coverage doc generator / tests.
export { JOBS, S as SCENARIOS, CLUSTER_PLAN, NAMES, SCORECARD_RECOMMENDATIONS };
