import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EXPORT_FORMATS, ExportFormat, pdfApi } from '../api/pdf.api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AppLayout from '../components/layout/AppLayout';
import Card from '../components/shared/Card';
import Avatar from '../components/shared/Avatar';
import Badge, { StatusBadge } from '../components/shared/Badge';
import Button from '../components/shared/Button';
import DetailRow from '../components/shared/DetailRow';
import SocialLinks from '../components/shared/SocialLinks';
import Modal from '../components/shared/Modal';
import { Field, Input, Textarea } from '../components/shared/Field';
import { CenteredSpinner } from '../components/shared/LoadingSpinner';
import { ErrorState } from '../components/shared/States';
import Icon from '../components/shared/Icon';
import { useToast } from '../components/shared/Toast';
import { useConfirm } from '../components/shared/Confirm';
import RecordTimeline from '../components/workflow/RecordTimeline';
import RecordTasks from '../components/workflow/Tasks';
import { organizationApi } from '../api/organization.api';
import { queryKeys } from '../api/queryKeys';
import { useJobs } from '../hooks/useJobs';
import { CreateOrganizationInput, Organization, OrganizationContact } from '../types';
import { errorMessage } from '../utils/errors';
import { isValidOptionalEmail } from '../utils/validation';

function EditOrganizationModal({ org, onClose }: { org: Organization; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({
    name: org.name,
    industry: org.industry ?? '',
    website: org.website ?? '',
    logoUrl: org.logoUrl ?? '',
    email: org.email ?? '',
    hq: org.hq ?? '',
    founded: org.founded ?? '',
    employeeCount: org.employeeCount != null ? String(org.employeeCount) : '',
    description: org.description ?? '',
    linkedin: org.socialLinks?.linkedin ?? '',
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const save = useMutation({
    mutationFn: () => {
      const input: Partial<CreateOrganizationInput> = {
        name: form.name.trim(),
        industry: form.industry.trim(),
        website: form.website.trim(),
        logoUrl: form.logoUrl.trim(),
        email: form.email.trim(),
        hq: form.hq.trim(),
        founded: form.founded.trim(),
        description: form.description.trim(),
        employeeCount: form.employeeCount.trim() ? Number(form.employeeCount) : undefined,
        socialLinks: { ...(org.socialLinks ?? {}), linkedin: form.linkedin.trim() || undefined },
      };
      return organizationApi.updateOrganization(org._id, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organization(org._id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations });
      toast.success('Organization updated');
      onClose();
    },
    onError: (err) => toast.error('Couldn’t save', errorMessage(err, 'Please try again.')),
  });
  const valid = form.name.trim() && isValidOptionalEmail(form.email);
  return (
    <Modal
      title="Edit organization"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Company name" required>
          {(id) => <Input id={id} value={form.name} onChange={(e) => set('name', e.target.value)} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Industry">{(id) => <Input id={id} value={form.industry} onChange={(e) => set('industry', e.target.value)} />}</Field>
          <Field label="Website">{(id) => <Input id={id} value={form.website} onChange={(e) => set('website', e.target.value)} />}</Field>
          <Field label="Headquarters">{(id) => <Input id={id} value={form.hq} onChange={(e) => set('hq', e.target.value)} />}</Field>
          <Field label="Founded">{(id) => <Input id={id} value={form.founded} onChange={(e) => set('founded', e.target.value)} />}</Field>
          <Field label="Employees">
            {(id) => <Input id={id} type="number" min={0} value={form.employeeCount} onChange={(e) => set('employeeCount', e.target.value)} />}
          </Field>
          <Field label="Email" error={isValidOptionalEmail(form.email) ? undefined : 'Enter a valid email'}>
            {(id) => <Input id={id} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />}
          </Field>
          <Field label="Logo URL">{(id) => <Input id={id} value={form.logoUrl} onChange={(e) => set('logoUrl', e.target.value)} />}</Field>
          <Field label="LinkedIn">{(id) => <Input id={id} value={form.linkedin} onChange={(e) => set('linkedin', e.target.value)} />}</Field>
        </div>
        <Field label="Description">
          {(id) => <Textarea id={id} rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} />}
        </Field>
      </div>
    </Modal>
  );
}

function ContactModal({ orgId, contact, onClose }: { orgId: string; contact?: OrganizationContact; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<OrganizationContact>(
    contact ?? { name: '', title: '', email: '', phone: '', linkedinUrl: '', isDecisionMaker: false, isHiringManager: false, notes: '' }
  );
  const set = <K extends keyof OrganizationContact>(k: K, v: OrganizationContact[K]) => setForm((f) => ({ ...f, [k]: v }));
  const save = useMutation({
    mutationFn: () => {
      const { id: _id, ...body } = form;
      return contact?.id ? organizationApi.updateContact(orgId, contact.id, body) : organizationApi.addContact(orgId, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organization(orgId) });
      toast.success(contact ? 'Contact updated' : 'Contact added');
      onClose();
    },
    onError: (err) => toast.error('Couldn’t save the contact', errorMessage(err, 'Please try again.')),
  });
  const valid = form.name.trim() && isValidOptionalEmail(form.email ?? '');
  return (
    <Modal
      title={contact ? 'Edit contact' : 'Add contact'}
      onClose={onClose}
      centered
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required>
            {(id) => <Input id={id} value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />}
          </Field>
          <Field label="Title">{(id) => <Input id={id} value={form.title ?? ''} onChange={(e) => set('title', e.target.value)} />}</Field>
          <Field label="Email">{(id) => <Input id={id} type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} />}</Field>
          <Field label="Phone">{(id) => <Input id={id} value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />}</Field>
        </div>
        <Field label="LinkedIn URL">{(id) => <Input id={id} value={form.linkedinUrl ?? ''} onChange={(e) => set('linkedinUrl', e.target.value)} />}</Field>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-[13px] text-foreground">
            <input type="checkbox" checked={!!form.isDecisionMaker} onChange={(e) => set('isDecisionMaker', e.target.checked)} />
            Decision maker
          </label>
          <label className="flex items-center gap-2 text-[13px] text-foreground">
            <input type="checkbox" checked={!!form.isHiringManager} onChange={(e) => set('isHiringManager', e.target.checked)} />
            Hiring manager
          </label>
        </div>
        <Field label="Notes">{(id) => <Textarea id={id} rows={2} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}

/** Branded profile export, PDF or Word (same SWFS letterhead template). */
function OrgPdfButton({ orgId }: { orgId: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  return (
    <>
      {EXPORT_FORMATS.map((f) => (
        <Button
          key={f.value}
          variant="secondary"
          size="sm"
          icon="download"
          loading={busy === f.value}
          disabled={busy !== null}
          onClick={async () => {
            setBusy(f.value);
            try {
              await pdfApi.organization(orgId, f.value);
            } catch {
              toast.error('Couldn’t generate the document', 'Please try again.');
            } finally {
              setBusy(null);
            }
          }}
        >
          {f.label}
        </Button>
      ))}
    </>
  );
}

/** Client account (admin only): profile, contacts, roles, notes and tasks. */
export default function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [contactModal, setContactModal] = useState<{ contact?: OrganizationContact } | null>(null);

  const { data: org, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.organization(id!),
    queryFn: () => organizationApi.getOrganization(id!),
    enabled: !!id,
  });
  const { data: jobs = [] } = useJobs();
  const orgJobs = jobs.filter((j) => j.organizationId === id);

  const removeContact = useMutation({
    mutationFn: (contactId: string) => organizationApi.deleteContact(id!, contactId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organization(id!) });
      toast.success('Contact removed');
    },
    onError: (err) => toast.error('Couldn’t remove the contact', errorMessage(err, 'Please try again.')),
  });

  if (isLoading) {
    return (
      <AppLayout title="Organization" backTo="/organization" backLabel="Back to organizations">
        <CenteredSpinner />
      </AppLayout>
    );
  }

  if (error || !org) {
    return (
      <AppLayout title="Organization" backTo="/organization" backLabel="Back to organizations">
        <ErrorState title="Organization not found" onRetry={() => refetch()} />
      </AppLayout>
    );
  }

  const openRoles = orgJobs.filter((j) => j.status === 'OPEN').length;
  const pipeline = orgJobs.reduce((s, j) => s + j.totalCandidates, 0);

  return (
    <AppLayout
      title={org.name}
      subtitle="Client account details"
      backTo="/organization"
      backLabel="Back to organizations"
      actions={
        <div className="ml-auto flex gap-2">
          <OrgPdfButton orgId={org._id} />
          <Button variant="secondary" size="sm" icon="edit" onClick={() => setEditing(true)}>
            Edit organization
          </Button>
        </div>
      }
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card padded={false}>
            <div className="flex items-start gap-3 border-b border-border px-5 py-4">
              <Avatar name={org.name} imageUrl={org.logoUrl} size="lg" />
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-foreground">{org.name}</h2>
                {org.description && <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{org.description}</p>}
              </div>
            </div>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 px-5 py-4 sm:grid-cols-2">
              {org.industry && <DetailRow label="Industry">{org.industry}</DetailRow>}
              {org.employeeCount != null && <DetailRow label="Employees">{org.employeeCount.toLocaleString()}</DetailRow>}
              {org.hq && <DetailRow label="Headquarters">{org.hq}</DetailRow>}
              {org.founded && <DetailRow label="Founded">{org.founded}</DetailRow>}
              {org.website && (
                <DetailRow label="Website">
                  <a href={org.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-text hover:underline">
                    {org.website.replace(/^https?:\/\//, '')}
                    <Icon name="external" size={12} />
                  </a>
                </DetailRow>
              )}
              {org.email && (
                <DetailRow label="Email">
                  <a href={`mailto:${org.email}`} className="text-brand-text hover:underline">
                    {org.email}
                  </a>
                </DetailRow>
              )}
            </dl>
            <SocialLinks links={org.socialLinks} className="border-t border-border px-5 py-3" />
          </Card>

          {/* Contacts */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-foreground">Contacts</h3>
              <Button size="sm" variant="ghost" icon="plus" onClick={() => setContactModal({})}>
                Add contact
              </Button>
            </div>
            {!org.contacts?.length ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                No contacts yet. Add the hiring managers and decision makers you work with.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {org.contacts.map((contact) => (
                  <Card key={contact.id ?? contact.name} className="group relative flex items-start gap-3">
                    <Avatar name={contact.name} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{contact.name}</p>
                      {contact.title && <p className="truncate text-xs text-muted-foreground">{contact.title}</p>}
                      <div className="mt-1 flex flex-wrap gap-1">
                        {contact.isDecisionMaker && <Badge tone="purple">Decision maker</Badge>}
                        {contact.isHiringManager && <Badge tone="info">Hiring manager</Badge>}
                      </div>
                      <div className="mt-1.5 space-y-0.5 text-xs">
                        {contact.email && (
                          <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 truncate text-brand-text hover:underline">
                            <Icon name="mail" size={11} /> {contact.email}
                          </a>
                        )}
                        {contact.phone && (
                          <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                            <Icon name="phone" size={11} /> {contact.phone}
                          </a>
                        )}
                        {contact.linkedinUrl && (
                          <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                            <Icon name="linkedin" size={11} /> LinkedIn
                          </a>
                        )}
                      </div>
                      {contact.notes && <p className="mt-1.5 text-2xs text-subtle-foreground">{contact.notes}</p>}
                    </div>
                    {contact.id && (
                      <div className="absolute right-2 top-2 flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                        <button type="button" aria-label="Edit contact" onClick={() => setContactModal({ contact })} className="rounded p-1 text-subtle-foreground hover:bg-muted hover:text-foreground">
                          <Icon name="edit" size={13} />
                        </button>
                        <button
                          type="button"
                          aria-label="Remove contact"
                          onClick={async () => {
                            if (await confirm({ title: `Remove ${contact.name}?`, confirmLabel: 'Remove', tone: 'danger' })) removeContact.mutate(contact.id!);
                          }}
                          className="rounded p-1 text-subtle-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Icon name="trash" size={13} />
                        </button>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Roles */}
          <div>
            <h3 className="mb-3 text-[13px] font-semibold text-foreground">
              Roles <span className="font-normal text-muted-foreground">· {openRoles} open · {pipeline} in pipeline</span>
            </h3>
            {orgJobs.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">No roles yet.</p>
            ) : (
              <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-xs">
                {orgJobs.map((j) => (
                  <Link key={j._id} to={`/jobs/${j._id}`} className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-foreground">{j.title}</p>
                      <p className="truncate text-2xs text-subtle-foreground">
                        {[j.department, j.location, j.owner && `Owner: ${j.owner.name}`].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs text-muted-foreground">{j.totalCandidates} candidates</span>
                      <StatusBadge status={j.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <RecordTimeline recordType="organization" recordId={org._id} title="Account notes & activity" />
        </div>

        <div className="space-y-6">
          <RecordTasks recordType="organization" recordId={org._id} />
        </div>
      </div>

      {editing && <EditOrganizationModal org={org} onClose={() => setEditing(false)} />}
      {contactModal && <ContactModal orgId={org._id} contact={contactModal.contact} onClose={() => setContactModal(null)} />}
    </AppLayout>
  );
}
