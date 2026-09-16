import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import { TableShell, Thead, Th, Tr, Td, EmptyRow } from '../components/shared/Table';
import { TableSkeleton } from '../components/shared/States';
import SocialLinks from '../components/shared/SocialLinks';
import Modal from '../components/shared/Modal';
import Button from '../components/shared/Button';
import { Field, Input, Textarea } from '../components/shared/Field';
import Avatar from '../components/shared/Avatar';
import { useOrganizations } from '../hooks/useOrganizations';
import { organizationApi } from '../api/organization.api';
import { queryKeys } from '../api/queryKeys';
import { useAuth } from '../context/AuthContext';
import { isAdminRole } from '../utils/roles';
import { useToast } from '../components/shared/Toast';
import { OrganizationSocialLinks } from '../types';

const EMPTY_FORM = {
  name: '',
  industry: '',
  website: '',
  hq: '',
  founded: '',
  employeeCount: '',
  email: '',
  description: '',
  logoUrl: '',
  linkedin: '',
  twitter: '',
  facebook: '',
  instagram: '',
};

function errorMessage(err: unknown, fallback: string): string {
  const anyErr = err as { response?: { data?: { error?: string } } };
  return anyErr?.response?.data?.error || fallback;
}

export default function OrganizationPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = isAdminRole(user?.role);
  const { data: orgs, isLoading } = useOrganizations();

  const [showForm, setShowForm] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scrapedFrom, setScrapedFrom] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);

  const set =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const resetForm = () => {
    setShowForm(false);
    setScrapeUrl('');
    setScrapedFrom('');
    setForm(EMPTY_FORM);
  };

  const scrape = useMutation({
    mutationFn: () => organizationApi.scrapeCompanyPage(scrapeUrl.trim()),
    onSuccess: (data) => {
      setForm((f) => ({
        ...f,
        name: data.name || f.name,
        website: data.website || f.website,
        hq: data.hq || f.hq,
        founded: data.founded || f.founded,
        employeeCount: data.employeeCount != null ? String(data.employeeCount) : f.employeeCount,
        email: data.email || f.email,
        description: data.description || f.description,
        logoUrl: data.logoUrl || f.logoUrl,
        linkedin: data.socialLinks?.linkedin || f.linkedin,
        twitter: data.socialLinks?.twitter || f.twitter,
        facebook: data.socialLinks?.facebook || f.facebook,
        instagram: data.socialLinks?.instagram || f.instagram,
      }));
      setScrapedFrom(new URL(data.sourceUrl).hostname);
      toast.success('Pulled details from the page', 'Review the fields below before saving.');
    },
    onError: (err) => toast.error('Couldn’t read that page', errorMessage(err, 'Check the URL and try again.')),
  });

  const createOrg = useMutation({
    mutationFn: () => {
      const socialLinks: OrganizationSocialLinks = {
        linkedin: form.linkedin.trim() || undefined,
        twitter: form.twitter.trim() || undefined,
        facebook: form.facebook.trim() || undefined,
        instagram: form.instagram.trim() || undefined,
      };
      return organizationApi.createOrganization({
        name: form.name.trim(),
        industry: form.industry.trim() || undefined,
        website: form.website.trim() || undefined,
        logoUrl: form.logoUrl.trim() || undefined,
        email: form.email.trim() || undefined,
        description: form.description.trim() || undefined,
        hq: form.hq.trim() || undefined,
        employeeCount: form.employeeCount.trim() ? Number(form.employeeCount) : undefined,
        founded: form.founded.trim() || undefined,
        socialLinks: Object.values(socialLinks).some(Boolean) ? socialLinks : undefined,
      });
    },
    onSuccess: (org) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations });
      resetForm();
      toast.success('Organization added', `${org.name} is now in your client list.`);
    },
    onError: (err) => toast.error('Couldn’t add the organization', errorMessage(err, 'Please try again.')),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    createOrg.mutate();
  };

  return (
    <AppLayout
      title="Organizations"
      actions={
        isAdmin ? (
          <div className="ml-auto">
            <Button variant="primary" icon="plus" onClick={() => setShowForm(true)}>
              New organization
            </Button>
          </div>
        ) : undefined
      }
    >
      {showForm && (
        <Modal
          title="Add organization"
          description="Pull details from the company's website, then review before saving."
          onClose={resetForm}
          size="lg"
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="rounded-md border border-border bg-background p-3">
              <p className="mb-2 text-[13px] font-medium text-foreground">Pull details from a URL</p>
              <div className="flex gap-2">
                <Input
                  type="url"
                  value={scrapeUrl}
                  onChange={(e) => setScrapeUrl(e.target.value)}
                  placeholder="https://company.com/about"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => scrape.mutate()}
                  disabled={!scrapeUrl.trim()}
                  loading={scrape.isPending}
                >
                  {scrape.isPending ? 'Fetching…' : 'Fetch details'}
                </Button>
              </div>
              <p className="mt-1.5 text-2xs text-subtle-foreground">
                Reads the page's public info — name, description, logo, contact & social links. Nothing is
                saved until you submit below.
              </p>
            </div>

            {scrapedFrom && (
              <p className="rounded-md bg-muted px-3 py-2 text-2xs text-muted-foreground">
                Details brought in from {scrapedFrom} — review and adjust before saving.
              </p>
            )}

            <div className="flex items-center gap-3">
              <Avatar name={form.name || '?'} imageUrl={form.logoUrl || undefined} size="md" />
              <div className="flex-1">
                <Field label="Logo URL" hint="optional">
                  {(id) => (
                    <Input
                      id={id}
                      value={form.logoUrl}
                      onChange={set('logoUrl')}
                      placeholder="https://company.com/logo.png"
                    />
                  )}
                </Field>
              </div>
            </div>

            <Field label="Company name" required>
              {(id) => <Input id={id} value={form.name} onChange={set('name')} required />}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Industry">
                {(id) => <Input id={id} value={form.industry} onChange={set('industry')} placeholder="e.g. Technology" />}
              </Field>
              <Field label="Website">
                {(id) => (
                  <Input id={id} type="url" value={form.website} onChange={set('website')} placeholder="https://…" />
                )}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Headquarters">
                {(id) => <Input id={id} value={form.hq} onChange={set('hq')} placeholder="e.g. San Francisco, CA" />}
              </Field>
              <Field label="Founded">
                {(id) => <Input id={id} value={form.founded} onChange={set('founded')} placeholder="e.g. 2015" />}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Employees" hint="optional">
                {(id) => (
                  <Input id={id} type="number" min={0} value={form.employeeCount} onChange={set('employeeCount')} />
                )}
              </Field>
              <Field label="Email">
                {(id) => <Input id={id} type="email" value={form.email} onChange={set('email')} />}
              </Field>
            </div>

            <Field label="Description">
              {(id) => (
                <Textarea id={id} value={form.description} onChange={set('description')} placeholder="What do they do?" />
              )}
            </Field>

            <div>
              <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle-foreground">
                Social links
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="LinkedIn">
                  {(id) => <Input id={id} value={form.linkedin} onChange={set('linkedin')} placeholder="https://linkedin.com/company/…" />}
                </Field>
                <Field label="Twitter / X">
                  {(id) => <Input id={id} value={form.twitter} onChange={set('twitter')} placeholder="https://x.com/…" />}
                </Field>
                <Field label="Facebook">
                  {(id) => <Input id={id} value={form.facebook} onChange={set('facebook')} placeholder="https://facebook.com/…" />}
                </Field>
                <Field label="Instagram">
                  {(id) => <Input id={id} value={form.instagram} onChange={set('instagram')} placeholder="https://instagram.com/…" />}
                </Field>
              </div>
            </div>

            {createOrg.isError && (
              <p className="text-xs text-brand-text">Couldn’t add the organization. Please try again.</p>
            )}

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="ghost" onClick={resetForm}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={!form.name.trim()} loading={createOrg.isPending}>
                {createOrg.isPending ? 'Adding…' : 'Add organization'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {isLoading ? (
        <TableSkeleton cols={5} />
      ) : (
        <TableShell>
          <Thead>
            <tr>
              <Th>Name</Th>
              <Th>Industry</Th>
              <Th>Email</Th>
              <Th>Headquarters</Th>
              <Th>Social</Th>
            </tr>
          </Thead>
          <tbody>
            {(orgs || []).map((org) => (
              <Tr key={org._id} onClick={() => navigate(`/organization/${org._id}`)}>
                <Td className="font-medium text-foreground">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={org.name} imageUrl={org.logoUrl} size="sm" />
                    {org.name}
                  </div>
                </Td>
                <Td>{org.industry || '—'}</Td>
                <Td>{org.email || '—'}</Td>
                <Td>{org.hq || '—'}</Td>
                <Td>
                  <SocialLinks links={org.socialLinks} stopPropagation />
                </Td>
              </Tr>
            ))}
            {(!orgs || orgs.length === 0) && <EmptyRow colSpan={5}>No organizations found.</EmptyRow>}
          </tbody>
        </TableShell>
      )}
    </AppLayout>
  );
}
