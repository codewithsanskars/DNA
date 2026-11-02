import { Candidate } from '../types';
import { downloadFile, toCsv } from './csv';
import { SOURCE_LABELS, WORK_AUTH_LABELS } from './labels';
import { humanize } from './format';

/**
 * CSV export (RC-79). Admins get every column; clients get only what they
 * can already see in the portal (the API strips internal fields for them
 * anyway, so the internal columns would just be blank).
 */
export function exportCandidatesCsv(candidates: Candidate[], isAdmin: boolean, fileStem = 'candidates') {
  const columns: [string, (c: Candidate) => unknown][] = [
    ['First name', (c) => c.firstName],
    ['Last name', (c) => c.lastName],
    ['Email', (c) => c.email],
    ['Phone', (c) => c.phone],
    ['Current title', (c) => c.currentTitle],
    ['Current company', (c) => c.currentCompany],
    ['Location', (c) => c.location],
    ['Years of experience', (c) => c.yearsExperience],
    ['Skills', (c) => c.skills],
    ['Languages', (c) => c.languages],
    ['Work authorization', (c) => (c.workAuthorization ? WORK_AUTH_LABELS[c.workAuthorization] : '')],
    ['Available from', (c) => c.availableFrom],
    ['Notice period (days)', (c) => c.noticePeriod],
    ['Status', (c) => humanize(c.globalStatus)],
    ['Sub-status', (c) => humanize(c.status)],
    ['Roles', (c) => c.jobLinks.map((l) => `${l.jobTitle} (${humanize(l.stage)})`)],
    ['LinkedIn', (c) => c.linkedinUrl],
  ];
  if (isAdmin) {
    columns.push(
      ['Clients', (c) => [...new Set(c.jobLinks.map((l) => l.organizationName).filter(Boolean))]],
      ['Source', (c) => (c.source ? SOURCE_LABELS[c.source] : '')],
      ['Current CTC', (c) => c.currentCtc],
      ['Expected CTC', (c) => c.expectedCtc],
      ['Currency', (c) => c.ctcCurrency],
      ['Tags', (c) => c.tags],
      ['Owner', (c) => c.owner?.name],
      ['Last contacted', (c) => c.lastContactedAt?.slice(0, 10)],
      ['Created', (c) => c.createdAt?.slice(0, 10)]
    );
  }
  // Ranked against a JD: lead with the match so the sheet sorts the same way.
  if (candidates.some((c) => c.match)) {
    columns.unshift(
      ['JD match %', (c) => c.match?.score],
      ['Matched skills', (c) => c.match?.matchedSkills],
      ['Missing must-haves', (c) => c.match?.missingSkills]
    );
  }
  const csv = toCsv(
    columns.map(([h]) => h),
    candidates.map((c) => columns.map(([, get]) => get(c)))
  );
  downloadFile(csv, `${fileStem}-${new Date().toISOString().slice(0, 10)}.csv`);
}
