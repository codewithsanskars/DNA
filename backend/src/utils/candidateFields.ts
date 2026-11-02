import { CandidateSource, WorkAuthorization } from '../types';
import { CANDIDATE_SOURCES, WORK_AUTHORIZATIONS } from '../entities/enums';
import { CertificationEntry, EducationEntry, EmploymentEntry } from '../entities/Candidate';
import { badRequest, optionalDate, optionalEnum, optionalNumber, optionalString, optionalStringArray } from './http';

/**
 * Validates the extended candidate profile fields (RC-01..RC-12) from a
 * request body. Every key is optional; an absent key comes back undefined
 * so it's skipped by partial updates, and an explicit null/'' clears it.
 */
export interface CandidateProfileFields {
  yearsExperience?: number | null;
  education?: EducationEntry[];
  certifications?: CertificationEntry[];
  employmentHistory?: EmploymentEntry[];
  languages?: string[];
  currentCtc?: number | null;
  expectedCtc?: number | null;
  ctcCurrency?: string;
  availableFrom?: string | null;
  workAuthorization?: WorkAuthorization | null;
  tags?: string[];
  source?: CandidateSource;
}

function listOf<T>(value: unknown, label: string, map: (item: Record<string, unknown>, i: number) => T): T[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw badRequest(`${label} must be a list`);
  if (value.length > 50) throw badRequest(`${label} can have at most 50 entries`);
  return value.map((item, i) => {
    if (!item || typeof item !== 'object') throw badRequest(`${label} entry ${i + 1} is invalid`);
    return map(item as Record<string, unknown>, i);
  });
}

const year = (v: unknown, label: string) => optionalNumber(v, label, { integer: true, min: 1900, max: 2100 }) ?? undefined;

export function parseProfileFields(body: Record<string, unknown>): CandidateProfileFields {
  const out: CandidateProfileFields = {};

  const years = optionalNumber(body.yearsExperience, 'Years of experience', { min: 0, max: 70 });
  if (years !== undefined) out.yearsExperience = years;

  out.education = listOf(body.education, 'Education', (e, i) => ({
    institution: optionalString(e.institution, `Education ${i + 1} institution`, 200) || '',
    degree: optionalString(e.degree, 'Degree', 200) || undefined,
    field: optionalString(e.field, 'Field of study', 200) || undefined,
    startYear: year(e.startYear, 'Start year'),
    endYear: year(e.endYear, 'End year'),
  }))?.filter((e) => e.institution || e.degree);

  out.certifications = listOf(body.certifications, 'Certifications', (c, i) => ({
    name: optionalString(c.name, `Certification ${i + 1} name`, 200) || '',
    issuer: optionalString(c.issuer, 'Issuer', 200) || undefined,
    issuedAt: optionalDate(c.issuedAt, 'Issued date') || undefined,
    expiresAt: optionalDate(c.expiresAt, 'Expiry date') || undefined,
  }))?.filter((c) => c.name);

  out.employmentHistory = listOf(body.employmentHistory, 'Employment history', (e, i) => ({
    company: optionalString(e.company, `Employer ${i + 1}`, 200) || '',
    title: optionalString(e.title, 'Title', 200) || undefined,
    startDate: optionalDate(e.startDate, 'Start date') || undefined,
    endDate: optionalDate(e.endDate, 'End date') || undefined,
    current: e.current === true || e.current === 'true',
  }))?.filter((e) => e.company);

  out.languages = optionalStringArray(body.languages, 'Languages', 30);
  out.tags = optionalStringArray(body.tags, 'Tags', 50)?.map((t) => t.slice(0, 60));

  const currentCtc = optionalNumber(body.currentCtc, 'Current CTC', { min: 0, max: 100_000_000 });
  if (currentCtc !== undefined) out.currentCtc = currentCtc;
  const expectedCtc = optionalNumber(body.expectedCtc, 'Expected CTC', { min: 0, max: 100_000_000 });
  if (expectedCtc !== undefined) out.expectedCtc = expectedCtc;

  const currency = optionalString(body.ctcCurrency, 'Currency', 3);
  if (currency) {
    if (!/^[A-Za-z]{3}$/.test(currency)) throw badRequest('Currency must be a 3-letter code like USD');
    out.ctcCurrency = currency.toUpperCase();
  }

  const availableFrom = optionalDate(body.availableFrom, 'Available from');
  if (availableFrom !== undefined) out.availableFrom = availableFrom ? availableFrom.slice(0, 10) : null;

  const auth = optionalEnum(body.workAuthorization, WORK_AUTHORIZATIONS, 'Work authorization');
  if (auth !== undefined) out.workAuthorization = auth;

  const source = optionalEnum(body.source, CANDIDATE_SOURCES, 'Source');
  if (source) out.source = source;

  // Drop undefined keys so a partial update never overwrites with undefined.
  for (const key of Object.keys(out) as (keyof CandidateProfileFields)[]) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

/** Fields only SWFS staff may see — removed from every CLIENT response. */
export const CLIENT_HIDDEN_CANDIDATE_FIELDS = [
  'currentCtc',
  'expectedCtc',
  'ctcCurrency',
  'tags',
  'owner',
  'lastContactedAt',
] as const;
