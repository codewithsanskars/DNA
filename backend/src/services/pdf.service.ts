import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import { candidateService } from './candidate.service';
import { jobService } from './job.service';
import { organizationService } from './organization.service';
import { matchService, scoreCandidate } from './match.service';
import { jobRepository } from '../repositories/job.repository';
import { notFound } from '../utils/http';

/**
 * Server-rendered PDF profiles. Built on the server, so the Admin/Client
 * redaction rules apply no matter what the browser asks for:
 *  - CLIENT callers always get the client-safe variant, and only roles from their own org.
 *  - ADMIN callers get client-safe by default (safe to forward), or `internal`.
 */

const BRAND = '#E5484D';
const INK = '#111827';
const MUTED = '#6B7280';
const RULE = '#E5E7EB';

const LOGO_CANDIDATES = [
  path.join(__dirname, '../../assets/logo.png'),
  path.join(__dirname, '../../../frontend/src/assets/SWFS-LOGO White Theme.png'),
];
const LOGO = LOGO_CANDIDATES.find((p) => fs.existsSync(p));

const human = (s?: string | null) => (s ? s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '');
const fmtDate = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric', day: undefined }) : '';
const ym = (d?: string) => {
  if (!d) return '';
  const [y, m] = d.split('-');
  if (!m) return y;
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};
// Built-in PDF fonts are WinAnsi; drop characters they can't render.
const safe = (s: unknown) =>
  String(s ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ–—•…]/g, '');

type Doc = PDFKit.PDFDocument;

function newDoc(title: string): Doc {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true, info: { Title: title, Author: 'SWFS' } });
  return doc;
}

function header(doc: Doc, title: string, subtitle?: string) {
  if (LOGO) {
    try {
      doc.image(LOGO, 50, 40, { height: 26 });
    } catch {
      /* unreadable logo — skip */
    }
  }
  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(`Generated ${new Date().toLocaleDateString('en-US', { dateStyle: 'medium' })}`, 50, 48, { align: 'right' });
  doc.moveDown(2.2);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(20).text(safe(title), 50);
  if (subtitle) doc.fillColor(MUTED).font('Helvetica').fontSize(11).text(safe(subtitle));
  doc.moveDown(0.6);
  rule(doc, BRAND, 1.5);
}

function rule(doc: Doc, color = RULE, width = 0.75) {
  const y = doc.y + 4;
  doc.save().moveTo(50, y).lineTo(doc.page.width - 50, y).lineWidth(width).strokeColor(color).stroke().restore();
  doc.y = y + 8;
}

function section(doc: Doc, title: string) {
  if (doc.y > doc.page.height - 140) doc.addPage();
  doc.moveDown(0.8);
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(9).text(title.toUpperCase(), 50, doc.y, { characterSpacing: 0.8 });
  rule(doc);
  doc.fillColor(INK).font('Helvetica').fontSize(10);
}

/** Two-column key/value grid. Empty values are skipped. */
function facts(doc: Doc, rows: [string, unknown][]) {
  const items = rows.filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length));
  const colW = (doc.page.width - 100) / 2;
  for (let i = 0; i < items.length; i += 2) {
    const y = doc.y;
    let maxY = y;
    [items[i], items[i + 1]].forEach((it, col) => {
      if (!it) return;
      const x = 50 + col * colW;
      doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(safe(it[0]), x, y, { width: colW - 12 });
      doc.fillColor(INK).font('Helvetica').fontSize(10).text(safe(Array.isArray(it[1]) ? it[1].join(', ') : it[1]), x, doc.y + 1, { width: colW - 12 });
      maxY = Math.max(maxY, doc.y);
    });
    doc.y = maxY + 6;
  }
  doc.x = 50;
}

function entry(doc: Doc, title: string, meta?: string, body?: string) {
  if (doc.y > doc.page.height - 100) doc.addPage();
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(10.5).text(safe(title), 50);
  if (meta) doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(safe(meta));
  if (body) doc.fillColor(INK).font('Helvetica').fontSize(10).text(safe(body));
  doc.moveDown(0.5);
}

function chips(doc: Doc, list: string[]) {
  doc.fillColor(INK).font('Helvetica').fontSize(10).text(safe(list.join('  •  ')), 50, doc.y, { width: doc.page.width - 100, lineGap: 2 });
}

function footer(doc: Doc, note: string) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - 36;
    doc.page.margins.bottom = 0;
    doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text(safe(note), 50, y, { width: doc.page.width - 160, lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, doc.page.width - 110, y, { width: 60, align: 'right', lineBreak: false });
  }
}

function toBuffer(doc: Doc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

export const fileSafe = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'profile';

export const pdfService = {
  candidateProfile: async (
    candidateId: string,
    orgScope: string | null,
    opts: { variant: 'client' | 'internal'; jobId?: string }
  ): Promise<{ buffer: Buffer; fileName: string }> => {
    const c: any = await candidateService.getCandidateById(candidateId, orgScope);
    if (!c) throw notFound('Candidate not found');
    const internal = orgScope === null && opts.variant === 'internal';
    const job = opts.jobId ? await jobService.getJobById(opts.jobId, orgScope) : null;
    if (opts.jobId && !job) throw notFound('Role not found');

    const name = `${c.firstName} ${c.lastName}`.trim();
    const doc = newDoc(`${name} — Candidate profile`);
    const headline = [c.currentTitle, c.currentCompany && `at ${c.currentCompany}`].filter(Boolean).join(' ');
    header(doc, name, [headline, c.location].filter(Boolean).join('  ·  '));

    // JD match for the requested role (same scorer the portal uses).
    if (job) {
      const req = await matchService.requirementsFor(job);
      const m = scoreCandidate(
        { id: c.id, currentTitle: c.currentTitle, location: c.location, skills: c.skills, yearsExperience: c.yearsExperience, employmentHistory: c.employmentHistory },
        req
      );
      section(doc, `Match to ${job.title}`);
      doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(22).text(`${m.score}%`, 50, doc.y, { continued: true });
      doc.fillColor(MUTED).font('Helvetica').fontSize(10).text('   JD match');
      if (m.matchedSkills.length) doc.fillColor(INK).fontSize(10).text(safe(`Matches: ${m.matchedSkills.join(', ')}`));
      if (m.missingSkills.length) doc.fillColor(MUTED).fontSize(10).text(safe(`Not evidenced: ${m.missingSkills.join(', ')}`));
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
    const links = (c.jobLinks || []).filter((l: any) => (orgScope ? l.organizationId === orgScope : internal));
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
      doc.text(safe(c.notes));
    }

    footer(doc, internal ? 'SWFS INTERNAL — contains compensation and CRM data. Do not share with clients.' : 'Confidential · Prepared by SWFS');
    return { buffer: await toBuffer(doc), fileName: `${fileSafe(name)}${internal ? '-internal' : ''}.pdf` };
  },

  organizationProfile: async (orgId: string, isAdmin: boolean): Promise<{ buffer: Buffer; fileName: string }> => {
    const org: any = await organizationService.getOrganizationProfile(orgId);
    if (!org) throw notFound('Organization not found');
    const jobs: any[] = await jobRepository.findByOrganization(orgId);

    const doc = newDoc(`${org.name} — Organization profile`);
    header(doc, org.name, [org.industry, org.hq].filter(Boolean).join('  ·  '));

    section(doc, 'Overview');
    facts(doc, [
      ['Website', org.website],
      ['Email', org.email],
      ['Headquarters', org.hq],
      ['Employees', org.employeeCount],
      ['Founded', org.founded],
      ['Industry', org.industry],
    ]);
    if (org.description) {
      doc.moveDown(0.3);
      doc.fillColor(INK).font('Helvetica').fontSize(10).text(safe(org.description), 50, doc.y, { width: doc.page.width - 100 });
    }

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

    footer(doc, isAdmin ? 'SWFS INTERNAL — includes contact notes and owners.' : 'Confidential · Prepared by SWFS');
    return { buffer: await toBuffer(doc), fileName: `${fileSafe(org.name)}-profile.pdf` };
  },
};
