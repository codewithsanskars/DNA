import { In, DeepPartial, SelectQueryBuilder } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { Candidate, Application, CandidateFeedback, InterviewFeedback } from '../entities';
import { CANDIDATE_STAGES } from '../entities/enums';
import { CandidateStage, GlobalStatus, CandidateStatus, RejectionReason } from '../types';
import { buildBooleanSearch } from '../utils/booleanSearch';
import { clientVisibleSql, submissionStamp } from '../utils/clientVisibility';

const repo = () => AppDataSource.getRepository(Candidate);
const appRepo = () => AppDataSource.getRepository(Application);
const interviewFeedbackRepo = () => AppDataSource.getRepository(InterviewFeedback);
const feedbackRepo = () => AppDataSource.getRepository(CandidateFeedback);

const RELATIONS = [
  'applications',
  'applications.job',
  'applications.job.organization',
  'applications.interviewFeedback',
  'feedback',
  'owner',
];

const num = (v: unknown) => (v == null ? undefined : Number(v));
const userRef = (u?: { id: string; name: string; email: string } | null) =>
  u ? { id: u.id, name: u.name, email: u.email } : null;

function toDto(c: Candidate) {
  return {
    _id: c.id,
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    currentlyWorking: c.currentlyWorking,
    currentTitle: c.currentTitle,
    currentCompany: c.currentCompany,
    location: c.location,
    skills: c.skills,
    // Served through the authenticated download route, not a direct file path.
    resumeUrl: c.resumeUrl ? `/api/candidates/${c.id}/resume` : undefined,
    resumeFileName: c.resumeFileName,
    // Served through the authenticated download route, not a direct file path.
    photoUrl: c.photoUrl ? `/api/candidates/${c.id}/photo` : undefined,
    photoFileName: c.photoFileName,
    linkedinUrl: c.linkedinUrl,
    website: c.website,
    notes: c.notes,
    clientRating: c.clientRating,
    noticePeriod: c.noticePeriod,
    source: c.source,
    globalStatus: c.globalStatus,
    status: c.status,
    yearsExperience: num(c.yearsExperience),
    education: c.education ?? [],
    certifications: c.certifications ?? [],
    employmentHistory: c.employmentHistory ?? [],
    languages: c.languages ?? [],
    currentCtc: num(c.currentCtc),
    expectedCtc: num(c.expectedCtc),
    ctcCurrency: c.ctcCurrency,
    availableFrom: c.availableFrom ?? undefined,
    workAuthorization: c.workAuthorization ?? undefined,
    tags: c.tags ?? [],
    owner: userRef(c.owner),
    lastContactedAt: c.lastContactedAt ?? undefined,
    createdAt: c.createdAt,
    syncedAt: c.updatedAt,
    jobLinks: (c.applications || []).map((a) => ({
      applicationId: a.id,
      appliedAt: a.appliedAt,
      stageUpdatedAt: a.stageUpdatedAt,
      rejectionReason: a.rejectionReason ?? undefined,
      submittedAt: a.submittedAt ?? undefined,
      submittedByEmail: a.submittedByEmail ?? undefined,
      submissionNote: a.submissionNote ?? undefined,
      clientViewedAt: a.clientViewedAt ?? undefined,
      rejectionNote: a.rejectionNote ?? undefined,
      jobId: a.job.id,
      jobTitle: a.job.title,
      stage: a.stage,
      organizationId: a.job.organization?.id,
      organizationName: a.job.organization?.name,
      interviewRound: a.interviewRound,
      interviewFeedback: (a.interviewFeedback || [])
        .map((f) => ({
          id: f.id,
          round: f.round,
          author: f.authorEmail,
          authorRole: f.authorRole,
          comment: f.comment,
          rating: f.rating,
          createdAt: f.createdAt,
        }))
        .sort((x, y) => x.round - y.round || x.createdAt.getTime() - y.createdAt.getTime()),
    })),
    feedback: (c.feedback || [])
      .map((f) => ({
        id: f.id,
        author: f.authorEmail,
        authorRole: f.authorRole,
        comment: f.comment,
        rating: f.rating,
        createdAt: f.createdAt,
      }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
  };
}

export const candidateRepository = {
  /**
   * How many candidates the caller can see: every candidate for SWFS
   * (organizationId null), or for a client those submitted to one of their
   * roles (utils/clientVisibility). Lists themselves are paginated via `search`.
   */
  countForScope: async (organizationId: string | null) => {
    if (!organizationId) return repo().count();
    const [row] = await AppDataSource.query(
      `SELECT COUNT(DISTINCT a."candidateId") AS count FROM applications a JOIN jobs j ON j.id = a."jobId"
        WHERE j."organizationId" = $1 AND ${clientVisibleSql('a')}`,
      [organizationId]
    );
    return Number(row?.count ?? 0);
  },

  // Callers are expected to have already verified job ownership (e.g. via
  // jobService.getJobById(jobId, orgScope)) before calling this.
  // `clientView` limits it to applications the client may see.
  findByJob: async (jobId: string, clientView = false) => {
    const qb = appRepo().createQueryBuilder('a').select('a."candidateId"', 'id').where('a."jobId" = :jobId', { jobId });
    if (clientView) qb.andWhere(clientVisibleSql('a'));
    const candidateIds = [...new Set((await qb.getRawMany<{ id: string }>()).map((r) => r.id))];
    if (!candidateIds.length) return [];
    const candidates = await repo().find({
      where: { id: In(candidateIds) },
      relations: RELATIONS,
      order: { createdAt: 'DESC' },
    });
    return candidates.map(toDto);
  },

  findById: async (id: string) => {
    const candidate = await repo().findOne({ where: { id }, relations: RELATIONS });
    return candidate ? toDto(candidate) : null;
  },

  // Same rule as findByOrganization: true only if the candidate is linked via
  // a client-visible Application to a job this org posted.
  isLinkedToOrganization: async (id: string, organizationId: string) => {
    const count = await appRepo()
      .createQueryBuilder('a')
      .innerJoin('a.candidate', 'c')
      .innerJoin('a.job', 'j')
      .where('c.id = :id', { id })
      .andWhere('j."organizationId" = :organizationId', { organizationId })
      .andWhere(clientVisibleSql('a'))
      .getCount();
    return count > 0;
  },

  create: async (data: any) => {
    const { jobLinks, rawData, ...rest } = data;
    const candidate = await repo().save(repo().create({ ...rest } as DeepPartial<Candidate>));
    for (const link of jobLinks || []) {
      const stage = (link.stage as CandidateStage) || 'APPLIED';
      await appRepo().save(
        appRepo().create({ candidate: { id: candidate.id } as any, job: { id: link.jobId } as any, stage, ...submissionStamp(stage) })
      );
    }
    return candidateRepository.findById(candidate.id);
  },

  // Adds a job link if the candidate isn't already linked to that job, otherwise leaves it untouched.
  addJobLink: async (id: string, jobId: string, _jobTitle: string, stage: CandidateStage = 'APPLIED') => {
    const existing = await appRepo().findOne({ where: { candidate: { id }, job: { id: jobId } } });
    if (!existing) {
      await appRepo().save(
        appRepo().create({ candidate: { id } as any, job: { id: jobId } as any, stage, ...submissionStamp(stage) })
      );
    }
    return candidateRepository.findById(id);
  },

  updateStageForJob: async (
    id: string,
    jobId: string,
    stage: CandidateStage,
    rejection?: { reason?: RejectionReason | null; note?: string | null }
  ) => {
    const current = await appRepo().findOne({ where: { candidate: { id }, job: { id: jobId } }, select: ['id', 'stage', 'submittedAt'] });
    await appRepo()
      .createQueryBuilder()
      .update(Application)
      .set({
        stage,
        stageUpdatedAt: new Date(),
        // Keeps client visibility consistent (utils/clientVisibility).
        ...submissionStamp(stage, current),
        // Leaving REJECTED clears the old reason; entering it records the new one.
        rejectionReason: stage === 'REJECTED' ? rejection?.reason ?? null : null,
        rejectionNote: stage === 'REJECTED' ? rejection?.note ?? null : null,
      })
      .where('candidateId = :id AND jobId = :jobId', { id, jobId })
      .execute();
    return candidateRepository.findById(id);
  },

  // Advances a role's interview round by one (0 -> 1 -> 2 -> 3), keeping
  // stage at 'INTERVIEW' throughout. Throws if the round is already at 3 —
  // callers past that point use the offer flow instead of another round.
  advanceInterviewRound: async (id: string, jobId: string) => {
    const application = await appRepo().findOne({ where: { candidate: { id }, job: { id: jobId } } });
    if (!application) throw new Error('Candidate is not linked to this role');
    if (application.interviewRound >= 3) throw new Error('All interview rounds have already been scheduled');

    await appRepo().update(application.id, {
      stage: 'INTERVIEW',
      stageUpdatedAt: new Date(),
      interviewRound: application.interviewRound + 1,
      ...submissionStamp('INTERVIEW', application),
    });
    return candidateRepository.findById(id);
  },

  addInterviewFeedback: async (
    id: string,
    jobId: string,
    round: number,
    entry: { author: string; authorRole?: string; comment: string; rating?: number }
  ) => {
    const application = await appRepo().findOne({ where: { candidate: { id }, job: { id: jobId } } });
    if (!application) throw new Error('Candidate is not linked to this role');

    await interviewFeedbackRepo().save(
      interviewFeedbackRepo().create({
        application: { id: application.id } as any,
        round,
        authorEmail: entry.author,
        authorRole: entry.authorRole as any,
        comment: entry.comment,
        rating: entry.rating,
      })
    );
    return candidateRepository.findById(id);
  },

  addFeedback: async (
    id: string,
    entry: { author: string; authorRole?: string; comment: string; rating?: number }
  ) => {
    await feedbackRepo().save(
      feedbackRepo().create({
        candidate: { id } as any,
        authorEmail: entry.author,
        authorRole: entry.authorRole as any,
        comment: entry.comment,
        rating: entry.rating,
      })
    );
    return candidateRepository.findById(id);
  },

  deleteFeedback: async (feedbackId: string) => {
    await feedbackRepo().delete(feedbackId);
  },

  deleteInterviewFeedback: async (feedbackId: string) => {
    await interviewFeedbackRepo().delete(feedbackId);
  },

  updateDetails: async (id: string, data: Partial<Candidate>) => {
    await repo().update(id, data);
    return candidateRepository.findById(id);
  },

  updateRating: async (id: string, clientRating: number) => {
    await repo().update(id, { clientRating });
    return candidateRepository.findById(id);
  },

  updateGlobalStatus: async (id: string, globalStatus: GlobalStatus, status: CandidateStatus) => {
    await repo().update(id, { globalStatus, status });
    return candidateRepository.findById(id);
  },

  updateStatus: async (id: string, status: CandidateStatus) => {
    await repo().update(id, { status });
    return candidateRepository.findById(id);
  },

  // Returns the on-disk filename + original name for the download route, or
  // null if the candidate has no resume. Kept separate from toDto() since the
  // stored filename must never reach the client directly.
  getResumeFile: async (id: string) => {
    const candidate = await repo().findOne({
      where: { id },
      select: ['id', 'resumeUrl', 'resumeFileName'],
    });
    if (!candidate?.resumeUrl) return null;
    return { storedName: candidate.resumeUrl, fileName: candidate.resumeFileName };
  },

  setResume: async (id: string, storedName: string, fileName: string) => {
    await repo().update(id, { resumeUrl: storedName, resumeFileName: fileName });
    return candidateRepository.findById(id);
  },

  clearResume: async (id: string) => {
    // `update()` silently ignores `undefined`/`null` values, so set to NULL via query builder.
    await repo()
      .createQueryBuilder()
      .update(Candidate)
      .set({ resumeUrl: () => 'NULL', resumeFileName: () => 'NULL' })
      .where('id = :id', { id })
      .execute();
    return candidateRepository.findById(id);
  },

  // Same pair of helpers as the resume, for the candidate's photo.
  getPhotoFile: async (id: string) => {
    const candidate = await repo().findOne({
      where: { id },
      select: ['id', 'photoUrl', 'photoFileName'],
    });
    if (!candidate?.photoUrl) return null;
    return { storedName: candidate.photoUrl, fileName: candidate.photoFileName };
  },

  setPhoto: async (id: string, storedName: string, fileName: string) => {
    await repo().update(id, { photoUrl: storedName, photoFileName: fileName });
    return candidateRepository.findById(id);
  },

  clearPhoto: async (id: string) => {
    await repo()
      .createQueryBuilder()
      .update(Candidate)
      .set({ photoUrl: () => 'NULL', photoFileName: () => 'NULL' })
      .where('id = :id', { id })
      .execute();
    return candidateRepository.findById(id);
  },

  findApplication: async (candidateId: string, jobId: string) => {
    return appRepo().findOne({
      where: { candidate: { id: candidateId }, job: { id: jobId } },
      relations: ['job', 'job.organization'],
    });
  },

  /** Moves an application to SUBMITTED and stamps who/when/why. */
  markSubmitted: async (applicationId: string, byEmail: string, note: string | null) => {
    await appRepo().update(applicationId, {
      stage: 'SUBMITTED',
      stageUpdatedAt: new Date(),
      submittedAt: new Date(),
      submittedByEmail: byEmail,
      submissionNote: note,
      // A re-submission should be seen again.
      clientViewedAt: null,
      rejectionReason: null,
      rejectionNote: null,
    });
  },

  /**
   * Stamps the first client view on this candidate's submitted, not-yet-viewed
   * applications for that client's roles. Returns how many were stamped.
   */
  markClientViewed: async (candidateId: string, organizationId: string) => {
    const result = await AppDataSource.query(
      `UPDATE applications a SET "clientViewedAt" = now()
         FROM jobs j
        WHERE a."jobId" = j.id AND j."organizationId" = $2 AND a."candidateId" = $1
          AND a."submittedAt" IS NOT NULL AND a."clientViewedAt" IS NULL`,
      [candidateId, organizationId]
    );
    return Array.isArray(result) ? Number(result[1] ?? 0) : 0;
  },

  findApplicationById: async (applicationId: string) => {
    return appRepo().findOne({
      where: { id: applicationId },
      relations: ['candidate', 'job', 'job.organization'],
    });
  },

  delete: async (id: string) => {
    await repo().delete(id);
  },

  touchLastContacted: async (id: string, at: Date) => {
    await repo()
      .createQueryBuilder()
      .update(Candidate)
      .set({ lastContactedAt: at })
      .where('id = :id AND ("lastContactedAt" IS NULL OR "lastContactedAt" < :at)', { id, at })
      .execute();
  },

  setOwner: async (ids: string[], ownerId: string | null) => {
    if (!ids.length) return;
    await repo()
      .createQueryBuilder()
      .update(Candidate)
      .set({ owner: ownerId ? ({ id: ownerId } as any) : null })
      .whereInIds(ids)
      .execute();
  },

  addTags: async (ids: string[], tags: string[]) => {
    if (!ids.length || !tags.length) return;
    // ARRAY(SELECT DISTINCT ...) keeps the column de-duplicated.
    await AppDataSource.query(
      `UPDATE candidates SET tags = ARRAY(SELECT DISTINCT unnest(tags || $2::text[])) WHERE id = ANY($1::uuid[])`,
      [ids, tags]
    );
  },

  removeTags: async (ids: string[], tags: string[]) => {
    if (!ids.length || !tags.length) return;
    await AppDataSource.query(
      `UPDATE candidates SET tags = ARRAY(SELECT t FROM unnest(tags) t WHERE lower(t) <> ALL(SELECT lower(x) FROM unnest($2::text[]) x)) WHERE id = ANY($1::uuid[])`,
      [ids, tags]
    );
  },

  allTags: async () => {
    const rows: { tag: string; count: string }[] = await AppDataSource.query(
      `SELECT t AS tag, COUNT(*) AS count FROM candidates, unnest(tags) t GROUP BY t ORDER BY COUNT(*) DESC, t ASC LIMIT 500`
    );
    return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
  },

  /**
   * Possible duplicates of a (new or imported) candidate: an exact email,
   * phone (last 10 digits) or LinkedIn match, or the same first + last name.
   */
  findDuplicates: async (probe: DuplicateProbe, excludeId?: string) => {
    const email = probe.email?.trim().toLowerCase() || null;
    const phone = digitsOf(probe.phone);
    const li = normalizeLinkedin(probe.linkedinUrl);
    const fn = probe.firstName?.trim().toLowerCase() || null;
    const ln = probe.lastName?.trim().toLowerCase() || null;

    const or: string[] = [];
    if (email) or.push('lower(c.email) = :email');
    if (phone) or.push(`right(regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g'), 10) = :phone`);
    if (li) or.push(`lower(rtrim(regexp_replace(coalesce(c."linkedinUrl", ''), '^https?://(www[.])?', ''), '/')) = :li`);
    if (fn && ln) or.push('(lower(c."firstName") = :fn AND lower(c."lastName") = :ln)');
    if (!or.length) return [];

    const qb = repo()
      .createQueryBuilder('c')
      .where(`(${or.join(' OR ')})`, { email, phone, li, fn, ln });
    if (excludeId) qb.andWhere('c.id != :excludeId', { excludeId });
    const rows = await qb.take(10).getMany();

    return rows.map((c) => ({
      _id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      linkedinUrl: c.linkedinUrl,
      currentTitle: c.currentTitle,
      currentCompany: c.currentCompany,
      globalStatus: c.globalStatus,
      matchedOn: [
        email && c.email?.toLowerCase() === email ? 'email' : null,
        phone && digitsOf(c.phone) === phone ? 'phone' : null,
        li && normalizeLinkedin(c.linkedinUrl) === li ? 'linkedin' : null,
        fn && ln && c.firstName.toLowerCase() === fn && c.lastName.toLowerCase() === ln ? 'name' : null,
      ].filter((m): m is string => !!m),
    }));
  },

  /** Server-side filtered + paginated candidate search (RC-21..RC-23, F-4). */
  /**
   * Lightweight rows for in-memory match scoring: only the fields the scorer
   * reads, no relations. Capped so a huge pool can't exhaust memory.
   */
  findMatchPool: async (params: CandidateSearchParams, cap = 5000) => {
    const qb = repo().createQueryBuilder('c');
    applySearchFilters(qb, params);
    const rows = await qb
      .select(['c.id', 'c.currentTitle', 'c.location', 'c.skills', 'c.yearsExperience', 'c.employmentHistory'])
      .orderBy('c.updatedAt', 'DESC')
      .take(cap)
      .getMany();
    return rows.map((c) => ({
      id: c.id,
      currentTitle: c.currentTitle,
      location: c.location,
      skills: c.skills ?? [],
      yearsExperience: c.yearsExperience != null ? Number(c.yearsExperience) : undefined,
      employmentHistory: c.employmentHistory ?? [],
    }));
  },

  /** IDs of candidates already linked to a role (excluded from "matches in the pool"). */
  linkedCandidateIds: async (jobId: string) => {
    const rows = await appRepo()
      .createQueryBuilder('a')
      .select('a."candidateId"', 'id')
      .where('a."jobId" = :jobId', { jobId })
      .getRawMany<{ id: string }>();
    return new Set(rows.map((r) => r.id));
  },

  /** Every distinct skill in the database — the no-LLM fallback vocabulary for reading a JD. */
  skillVocabulary: async () => {
    const rows = await AppDataSource.query(`SELECT DISTINCT lower(trim(s)) AS s FROM candidates, unnest(skills) AS s WHERE length(trim(s)) > 1`);
    return (rows as { s: string }[]).map((r) => r.s);
  },

  /** Full DTOs for the given IDs, in the given order. */
  findManyOrdered: async (ids: string[]) => {
    if (!ids.length) return [];
    const full = await repo().find({ where: { id: In(ids) }, relations: RELATIONS });
    const byId = new Map(full.map((c) => [c.id, c]));
    return ids.map((id) => byId.get(id)).filter((c): c is Candidate => !!c).map(toDto);
  },

  search: async (params: CandidateSearchParams) => {
    const qb = repo().createQueryBuilder('c');
    applySearchFilters(qb, params);

    const sortMap: Record<string, [string, 'ASC' | 'DESC', 'NULLS FIRST' | 'NULLS LAST']> = {
      recent: ['c.createdAt', 'DESC', 'NULLS LAST'],
      updated: ['c.updatedAt', 'DESC', 'NULLS LAST'],
      name: ['c.firstName', 'ASC', 'NULLS LAST'],
      experience: ['c.yearsExperience', 'DESC', 'NULLS LAST'],
      lastContacted: ['c.lastContactedAt', 'ASC', 'NULLS FIRST'],
      available: ['c.availableFrom', 'ASC', 'NULLS LAST'],
    };
    const [col, dir, nulls] = sortMap[params.sort ?? 'recent'] ?? sortMap.recent;
    qb.orderBy(col, dir, nulls).addOrderBy('c.id', 'ASC');

    const pageSize = Math.min(Math.max(params.pageSize ?? 25, 1), 200);
    const page = Math.max(params.page ?? 1, 1);
    const [rows, total] = await qb
      .select(['c.id'])
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    const ids = rows.map((r) => r.id);
    const full = ids.length ? await repo().find({ where: { id: In(ids) }, relations: RELATIONS }) : [];
    const byId = new Map(full.map((c) => [c.id, c]));
    return {
      items: ids
        .map((id) => byId.get(id))
        .filter((c): c is Candidate => !!c)
        .map(toDto),
      total,
      page,
      pageSize,
    };
  },

  /** Totals per global status for the same filters (tab badges), ignoring the status filter itself. */
  countByGlobalStatus: async (params: CandidateSearchParams) => {
    const qb = repo().createQueryBuilder('c');
    applySearchFilters(qb, { ...params, globalStatus: undefined });
    const rows = await qb
      .select('c."globalStatus"', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('c."globalStatus"')
      .getRawMany<{ status: string; count: string }>();
    const out: Record<string, number> = { OPEN: 0, SELECTED: 0, ONBOARDED: 0, ARCHIVED: 0 };
    for (const r of rows) out[r.status] = Number(r.count);
    return out;
  },

  // organizationId === null means "any client" — reserved for SWFS admin/recruiter callers.
  countByStage: async (organizationId: string | null) => {
    const counts: Record<string, number> = {};
    for (const stage of CANDIDATE_STAGES) counts[stage] = 0;

    const qb = appRepo()
      .createQueryBuilder('a')
      .innerJoin('a.job', 'j')
      .select('a.stage', 'stage')
      .addSelect('COUNT(*)', 'count')
      .groupBy('a.stage');
    if (organizationId) qb.andWhere('j."organizationId" = :organizationId', { organizationId }).andWhere(clientVisibleSql('a'));

    const rows = await qb.getRawMany<{ stage: string; count: string }>();
    for (const row of rows) counts[row.stage] = parseInt(row.count, 10);
    return counts;
  },
};

export interface DuplicateProbe {
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  firstName?: string;
  lastName?: string;
}

export interface CandidateSearchParams {
  q?: string;
  skills?: string[];
  title?: string;
  company?: string;
  location?: string;
  education?: string;
  minExperience?: number;
  maxExperience?: number;
  maxExpectedCtc?: number;
  maxNoticePeriod?: number;
  availableBy?: string;
  workAuthorization?: string[];
  globalStatus?: string[];
  source?: string[];
  tags?: string[];
  ownerId?: string;
  jobId?: string;
  stage?: string[];
  /** Restrict to candidates linked to this client org's roles (CLIENT callers). */
  organizationId?: string;
  /** Search only fields a client can see (no tags). */
  clientSafe?: boolean;
  /** The reachable pool: OPEN, plus ARCHIVED with a re-engageable sub-status. */
  masterPool?: boolean;
  page?: number;
  pageSize?: number;
  sort?: string;
}

/** Last 10 digits of a phone number, or null if it's too short to compare. */
function digitsOf(phone?: string | null): string | null {
  const d = (phone || '').replace(/[^0-9]/g, '');
  return d.length >= 7 ? d.slice(-10) : null;
}

function normalizeLinkedin(url?: string | null): string | null {
  if (!url?.trim()) return null;
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www[.])?/, '')
    .replace(/\/+$/, '');
}

/** Escapes LIKE wildcards so a user's `50%` or `c_sharp` matches literally. */
const likeEscape = (v: string) => v.replace(/[\\%_]/g, (m) => `\\${m}`);

// Every text field a keyword can hit — profile, history, education, tags.
const SEARCHABLE = `concat_ws(' ', c."firstName", c."lastName", c.email, c."currentTitle", c."currentCompany",
  c.location, c.notes, array_to_string(c.skills, ' '), array_to_string(c.tags, ' '),
  array_to_string(c.languages, ' '), c."employmentHistory"::text, c.education::text, c.certifications::text)`;

// What a client may keyword-search: their view of the profile, no internal tags.
const CLIENT_SEARCHABLE = `concat_ws(' ', c."firstName", c."lastName", c.email, c."currentTitle", c."currentCompany",
  c.location, array_to_string(c.skills, ' '), array_to_string(c.languages, ' '))`;

function applySearchFilters(qb: SelectQueryBuilder<Candidate>, p: CandidateSearchParams) {
  let n = 0;
  // Registers a bound parameter and returns its placeholder — `:pN`, or
  // `(:...pN)` for a list used with IN.
  const bind = (value: unknown) => {
    const key = `p${n++}`;
    qb.setParameter(key, value);
    return Array.isArray(value) ? `(:...${key})` : `:${key}`;
  };

  if (p.q?.trim()) {
    const fields = p.clientSafe ? CLIENT_SEARCHABLE : SEARCHABLE;
    const sql = buildBooleanSearch(p.q, (term) => `${fields} ILIKE ${bind(`%${likeEscape(term)}%`)}`);
    if (sql) qb.andWhere(`(${sql})`);
  }
  for (const skill of p.skills ?? []) {
    qb.andWhere(`EXISTS (SELECT 1 FROM unnest(c.skills) s WHERE s ILIKE ${bind(`%${likeEscape(skill)}%`)})`);
  }
  for (const tag of p.tags ?? []) {
    qb.andWhere(`EXISTS (SELECT 1 FROM unnest(c.tags) t WHERE lower(t) = lower(${bind(tag)}))`);
  }
  if (p.title) qb.andWhere(`c."currentTitle" ILIKE ${bind(`%${likeEscape(p.title)}%`)}`);
  if (p.company) {
    const v = bind(`%${likeEscape(p.company)}%`);
    qb.andWhere(`(c."currentCompany" ILIKE ${v} OR c."employmentHistory"::text ILIKE ${v})`);
  }
  if (p.location) qb.andWhere(`c.location ILIKE ${bind(`%${likeEscape(p.location)}%`)}`);
  if (p.education) qb.andWhere(`c.education::text ILIKE ${bind(`%${likeEscape(p.education)}%`)}`);
  // A minimum of 0 is "no minimum" — it would otherwise exclude everyone with no experience recorded.
  if (p.minExperience) qb.andWhere(`c."yearsExperience" >= ${bind(p.minExperience)}`);
  if (p.maxExperience != null) qb.andWhere(`c."yearsExperience" <= ${bind(p.maxExperience)}`);
  if (p.maxExpectedCtc != null) qb.andWhere(`c."expectedCtc" <= ${bind(p.maxExpectedCtc)}`);
  if (p.maxNoticePeriod != null) qb.andWhere(`c."noticePeriod" <= ${bind(p.maxNoticePeriod)}`);
  if (p.availableBy) qb.andWhere(`(c."availableFrom" IS NULL OR c."availableFrom" <= ${bind(p.availableBy)})`);
  if (p.workAuthorization?.length) qb.andWhere(`c."workAuthorization" IN ${bind(p.workAuthorization)}`);
  if (p.globalStatus?.length) qb.andWhere(`c."globalStatus" IN ${bind(p.globalStatus)}`);
  if (p.source?.length) qb.andWhere(`c.source IN ${bind(p.source)}`);
  if (p.ownerId === 'none') qb.andWhere('c."ownerId" IS NULL');
  else if (p.ownerId) qb.andWhere(`c."ownerId" = ${bind(p.ownerId)}`);
  if (p.masterPool) {
    qb.andWhere(
      `(c."globalStatus" = 'OPEN' OR (c."globalStatus" = 'ARCHIVED' AND c.status IN ('OPPORTUNITY', 'CONTACTED', 'NOT_INTERESTED')))`
    );
  }
  // Role / stage / org conditions must hold on the *same* application, so a
  // client's stage filter can't match through another client's role.
  if (p.jobId || p.stage?.length || p.organizationId) {
    const conds = ['a."candidateId" = c.id'];
    if (p.jobId) conds.push(`a."jobId" = ${bind(p.jobId)}`);
    if (p.stage?.length) conds.push(`a.stage IN ${bind(p.stage)}`);
    if (p.organizationId) conds.push(`j."organizationId" = ${bind(p.organizationId)}`, clientVisibleSql('a'));
    qb.andWhere(`EXISTS (SELECT 1 FROM applications a JOIN jobs j ON j.id = a."jobId" WHERE ${conds.join(' AND ')})`);
  }
}
