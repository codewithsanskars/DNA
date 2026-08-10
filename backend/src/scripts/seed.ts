import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { Organization } from '../models/Organization';
import { User } from '../models/User';
import { OrganizationUser } from '../models/OrganizationUser';

const ORGS = [
  { name: 'TechCorp Inc', slug: 'org_techcorp', industry: 'Technology', website: 'https://techcorp.example.com' },
  { name: 'FinanceGroup LLC', slug: 'org_financegroup', industry: 'Financial Services', website: 'https://financegroup.example.com' },
];

const USERS = [
  { email: 'admin@swfs.ai', name: 'SWFS Admin', role: 'SWFS_ADMIN', orgSlug: 'org_techcorp' },
  { email: 'client.admin@techcorp.com', name: 'Sarah Chen', role: 'CLIENT_ADMIN', orgSlug: 'org_techcorp' },
  { email: 'hiring@techcorp.com', name: 'Mark Johnson', role: 'HIRING_MANAGER', orgSlug: 'org_techcorp' },
  { email: 'viewer@techcorp.com', name: 'Tom Lee', role: 'VIEWER', orgSlug: 'org_techcorp' },
  { email: 'client.admin@financegroup.com', name: 'Jennifer Walsh', role: 'CLIENT_ADMIN', orgSlug: 'org_financegroup' },
  { email: 'hiring@financegroup.com', name: 'Patrick Moore', role: 'HIRING_MANAGER', orgSlug: 'org_financegroup' },
];

async function seed() {
  await connectDB();
  console.log('Seeding database...');

  await Organization.deleteMany({});
  await User.deleteMany({});
  await OrganizationUser.deleteMany({});

  const orgs = await Organization.insertMany(ORGS);
  const orgMap = Object.fromEntries(orgs.map((o) => [o.slug, o]));

  for (const u of USERS) {
    const user = await User.create({ email: u.email, name: u.name, role: u.role });
    const org = orgMap[u.orgSlug];
    if (org) {
      await OrganizationUser.create({
        organizationId: org._id.toString(),
        userId: user._id.toString(),
        role: u.role,
      });
    }
  }

  console.log('Seed complete.');
  await mongoose.disconnect();
}

seed().catch(console.error);
