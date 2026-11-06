import { candidateService } from './candidate.service';
import { jobService } from './job.service';
import { organizationService } from './organization.service';
import { matchService, scoreCandidate } from './match.service';
import { jobRepository } from '../repositories/job.repository';
import { notFound } from '../utils/http';
import { Block, BrandedDoc, ExportFormat, MIME, renderBrandedDoc } from './brandedDoc.service';
import { isClientVisible } from '../utils/clientVisibility';

/**
 * Server-rendered profile exports (PDF or Word), laid out on the SWFS company
 * template in brandedDoc.service.ts. Built on the server, so the Admin/Client
 * redaction rules apply no matter what the browser asks for:
 *  - CLIENT callers always get the client-safe variant, and only roles from their own org.
 *  - ADMIN callers get client-safe by default (safe to forward), or `internal`.
 */

const human = (s?: string | null) => (s ? s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '');
const fmtDate = (d?: string | Date | null) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '');
const ym = (d?: string) => {
  if (!d) return '';
  const [y, m] = d.split('-');
  if (!m) return y;
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

type Out = { buffer: Buffer; fileName: string; mimeType: string };
const finish = async (d: BrandedDoc, stem: string, format: ExportFormat): Promise<Out> => ({
  buffer: await renderBrandedDoc(d, format),
  fileName: `${stem}.${format}`,
  mimeType: MIME[format],
});

// Builders collect template blocks; brandedDoc.service lays them out.
type Blocks = Block[];
const section = (b: Blocks, title: string) => b.push({ kind: 'section', title });
const facts = (b: Blocks, rows: [string, unknown][]) => b.push({ kind: 'facts', rows });
const entry = (b: Blocks, title: string, meta?: string, body?: string) => b.push({ kind: 'entry', title, meta, body });
const chips = (b: Blocks, items: string[]) => b.push({ kind: 'chips', items });
const text = (b: Blocks, t: string) => b.push({ kind: 'text', text: t });

export const fileSafe = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'profile';

export const pdfService = {
  candidateProfile: async (
    candidateId: string,
    orgScope: string | null,
    opts: { variant: 'client' | 'internal'; jobId?: string; format?: ExportFormat }
  ): Promise<Out> => {
    const c: any = await candidateService.getCandidateById(candidateId, orgScope);
    if (!c) throw notFound('Candidate not found');
    const internal = orgScope === null && opts.variant === 'internal';
    const job = opts.jobId ? await jobService.getJobById(opts.jobId, orgScope) : null;
    if (opts.jobId && !job) throw notFound('Role not found');

    const name = `${c.firstName} ${c.lastName}`.trim();
    const doc: Blocks = [];
    const headline = [c.currentTitle, c.currentCompany && `at ${c.currentCompany}`].filter(Boolean).join(' ');

    // JD match for the requested role (same scorer the portal uses).
    if (job) {
      const req = await matchService.requirementsFor(job);
      const m = scoreCandidate(
        { id: c.id, currentTitle: c.currentTitle, location: c.location, skills: c.skills, yearsExperience: c.yearsExperience, employmentHistory: c.employmentHistory },
        req
      );
      section(doc, `Match to ${job.title}`);
      doc.push({
        kind: 'score',
        value: `${m.score}%`,
        label: 'JD match',
        lines: [
          ...(m.matchedSkills.length ? [{ text: `Matches: ${m.matchedSkills.join(', ')}` }] : []),
          ...(m.missingSkills.length ? [{ text: `Not evidenced: ${m.missingSkills.join(', ')}`, muted: true }] : []),
        ],
      });
    }

    section(doc, 'Overview');
    facts(doc, [
      ['Email', c.email],
      ['Phone', c.phone],
      ['LinkedIn', c.linkedinUrl],
      ['Website', c.website],
      ['Experience', c.yearsExperience != null ? `${c.yearsExperience} years` : ''],
      ['Notice period', c.noticePeriod != null ? `${c.noticePeriod} days` : ''],
      ['Available from', c.availableFrom ? fmtDate(c.availableFrom) : ''],
      ['Work authorization', human(c.workAuthorization)],
      ['Languages', c.languages],
      ...(internal
        ? ([
            ['Current CTC', c.currentCtc != null ? `${Number(c.currentCtc).toLocaleString('en-US')} ${c.ctcCurrency}` : ''],
            ['Expected CTC', c.expectedCtc != null ? `${Number(c.expectedCtc).toLocaleString('en-US')} ${c.ctcCurrency}` : ''],
            ['Source', human(c.source)],
            ['Owner', c.owner?.name],
            ['Status', [human(c.globalStatus), human(c.status)].filter(Boolean).join(' / ')],
            ['Tags', c.tags],
          ] as [string, unknown][])
        : []),
    ]);

    if (c.skills?.length) {
      section(doc, 'Skills');
      chips(doc, c.skills);
    }

    if (c.employmentHistory?.length) {
      section(doc, 'Experience');
      for (const e of c.employmentHistory) {
        const dates = [ym(e.startDate), e.current ? 'Present' : ym(e.endDate)].filter(Boolean).join(' – ');
        entry(doc, [e.title, e.company].filter(Boolean).join(' · '), dates);
      }
    }

    if (c.education?.length) {
      section(doc, 'Education');
      for (const e of c.education) {
        entry(doc, e.institution, [[e.degree, e.field].filter(Boolean).join(', '), [e.startYear, e.endYear].filter(Boolean).join(' – ')].filter(Boolean).join('  ·  '));
      }
    }

    if (c.certifications?.length) {
      section(doc, 'Certifications');
      for (const e of c.certifications) {
        entry(doc, e.name, [e.issuer, e.issuedAt && `Issued ${fmtDate(e.issuedAt)}`, e.expiresAt && `Expires ${fmtDate(e.expiresAt)}`].filter(Boolean).join('  ·  '));
      }
    }

    // Roles: clients only ever see their own org's; client-safe admin PDFs omit them (they'd reveal other clients).
    // ...and for clients, only roles SWFS has submitted the candidate to (utils/clientVisibility).
    const links = (c.jobLinks || []).filter((l: any) => (orgScope ? l.organizationId === orgScope && isClientVisible(l) : internal));
    if (links.length) {
      section(doc, 'Roles');
      for (const l of links) {
        entry(doc, l.jobTitle, [internal && l.organizationName, human(l.stage), l.appliedAt && `Linked ${fmtDate(l.appliedAt)}`].filter(Boolean).join('  ·  '));
      }
    }

    const feedback = (c.feedback || []).filter((f: any) => f.comment).slice(0, 6);
    if (feedback.length && (internal || orgScope)) {
      section(doc, 'Feedback');
      for (const f of feedback) entry(doc, `${f.rating ? `${f.rating}/5  ` : ''}${f.author ?? ''}`, fmtDate(f.createdAt), f.comment);
    }

    if (internal && c.notes) {
      section(doc, 'Recruiter notes (internal)');
      text(doc, c.notes);
    }

    const out: BrandedDoc = {
      docType: internal ? 'Candidate profile · Internal' : 'Candidate profile',
      title: name,
      subtitle: [headline, c.location].filter(Boolean).join('  ·  '),
      footerNote: internal ? 'SWFS INTERNAL — contains compensation and CRM data. Do not share with clients.' : 'Confidential · Prepared by SWFS',
      blocks: doc,
    };
    return finish(out, `${fileSafe(name)}${internal ? '-internal' : ''}`, opts.format ?? 'pdf');
  },

  organizationProfile: async (orgId: string, isAdmin: boolean, format: ExportFormat = 'pdf'): Promise<Out> => {
    const org: any = await organizationService.getOrganizationProfile(orgId);
    if (!org) throw notFound('Organization not found');
    let jobs: any[] = await jobRepository.findByOrganization(orgId);
    if (!isAdmin) {
      // Client copies count only candidates submitted to them.
      const counts = await jobRepository.clientVisibleCounts(jobs.map((j) => j.id));
      jobs = jobs.map((j) => ({ ...j, totalCandidates: counts.get(j.id) ?? 0 }));
    }

    const doc: Blocks = [];

    section(doc, 'Overview');
    facts(doc, [
      ['Website', org.website],
      ['Email', org.email],
      ['Headquarters', org.hq],
      ['Employees', org.employeeCount],
      ['Founded', org.founded],
      ['Industry', org.industry],
    ]);
    if (org.description) text(doc, org.description);

    const open = jobs.filter((j) => j.status === 'OPEN');
    section(doc, 'Hiring at a glance');
    facts(doc, [
      ['Open roles', String(open.length)],
      ['All roles', String(jobs.length)],
      ['Candidates in pipeline', String(jobs.reduce((a, j) => a + (j.totalCandidates || 0), 0))],
      ['Most recent role', jobs[0] ? `${jobs[0].title} (${fmtDate(jobs[0].openedAt ?? jobs[0].createdAt)})` : ''],
    ]);

    if (jobs.length) {
      section(doc, 'Roles');
      for (const j of jobs.slice(0, 40)) {
        entry(
          doc,
          j.title,
          [human(j.status), j.priority && `${human(j.priority)} priority`, j.location, `${j.totalCandidates} candidate${j.totalCandidates === 1 ? '' : 's'}`, isAdmin && j.owner?.name && `Owner: ${j.owner.name}`]
            .filter(Boolean)
            .join('  ·  '),
          j.aiSummary || undefined
        );
      }
    }

    if (org.contacts?.length) {
      section(doc, 'Contacts');
      for (const ct of org.contacts) {
        const roles = [ct.isDecisionMaker && 'Decision maker', ct.isHiringManager && 'Hiring manager'].filter(Boolean).join(', ');
        entry(doc, [ct.name, ct.title].filter(Boolean).join(' · '), [ct.email, ct.phone, roles].filter(Boolean).join('  ·  '), isAdmin && ct.notes ? ct.notes : undefined);
      }
    }

    const out: BrandedDoc = {
      docType: 'Organization profile',
      title: org.name,
      subtitle: [org.industry, org.hq].filter(Boolean).join('  ·  '),
      footerNote: isAdmin ? 'SWFS INTERNAL — includes contact notes and owners.' : 'Confidential · Prepared by SWFS',
      blocks: doc,
    };
    return finish(out, `${fileSafe(org.name)}-profile`, format);
  },
};
