import { In } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { Application, Interview, InterviewScorecard, Offer, Placement } from '../entities';
import { ScorecardRating } from '../entities/InterviewScorecard';

const interviews = () => AppDataSource.getRepository(Interview);
const offers = () => AppDataSource.getRepository(Offer);
const placements = () => AppDataSource.getRepository(Placement);
const applications = () => AppDataSource.getRepository(Application);
const scorecards = () => AppDataSource.getRepository(InterviewScorecard);

const APP_RELATIONS = ['application', 'application.candidate', 'application.job', 'application.job.organization'];
const num = (v: unknown) => (v == null ? null : Number(v));

function appContext(a: Application) {
  return {
    applicationId: a.id,
    candidateId: a.candidate?.id,
    candidateName: a.candidate ? `${a.candidate.firstName} ${a.candidate.lastName}` : undefined,
    jobId: a.job?.id,
    jobTitle: a.job?.title,
    organizationId: a.job?.organization?.id ?? null,
    organizationName: a.job?.organization?.name ?? null,
  };
}

function interviewToDto(i: Interview) {
  return {
    id: i.id,
    ...appContext(i.application),
    round: i.round,
    scheduledAt: i.scheduledAt,
    durationMinutes: i.durationMinutes,
    mode: i.mode,
    location: i.location ?? undefined,
    interviewers: i.interviewers ?? undefined,
    status: i.status,
    notes: i.notes ?? undefined,
    createdByEmail: i.createdByEmail,
    createdAt: i.createdAt,
  };
}

function offerToDto(o: Offer) {
  return {
    id: o.id,
    ...appContext(o.application),
    amount: Number(o.amount),
    currency: o.currency,
    rateType: o.rateType,
    startDate: o.startDate ?? undefined,
    expiresAt: o.expiresAt ?? undefined,
    status: o.status,
    notes: o.notes ?? undefined,
    respondedAt: o.respondedAt ?? undefined,
    createdByEmail: o.createdByEmail,
    createdAt: o.createdAt,
  };
}

function placementToDto(p: Placement) {
  return {
    id: p.id,
    ...appContext(p.application),
    startDate: p.startDate,
    endDate: p.endDate ?? undefined,
    billRate: num(p.billRate),
    payRate: num(p.payRate),
    fee: num(p.fee),
    guaranteeDays: p.guaranteeDays ?? null,
    status: p.status,
    notes: p.notes ?? undefined,
    createdByEmail: p.createdByEmail,
    createdAt: p.createdAt,
  };
}

function scorecardToDto(s: InterviewScorecard) {
  const scored = s.ratings.map((r) => r.score).filter((x): x is number => typeof x === 'number');
  return {
    id: s.id,
    ...appContext(s.application),
    round: s.round,
    authorEmail: s.authorEmail,
    authorName: s.authorName ?? s.authorEmail,
    authorRole: s.authorRole,
    ratings: s.ratings,
    recommendation: s.recommendation,
    summary: s.summary ?? undefined,
    /** Mean of the criteria that were scored (1–5), null if none were. */
    overall: scored.length ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 10) / 10 : null,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

export type ScorecardDto = ReturnType<typeof scorecardToDto>;
export type InterviewDto = ReturnType<typeof interviewToDto>;
export type OfferDto = ReturnType<typeof offerToDto>;
export type PlacementDto = ReturnType<typeof placementToDto>;

/** organizationId === null means every client (admin callers). */
function scopeWhere(organizationId: string | null, extra: Record<string, unknown> = {}) {
  return organizationId
    ? { ...extra, application: { ...(extra.application as object), job: { organization: { id: organizationId } } } }
    : extra;
}

export const pipelineRepository = {
  findApplication: (candidateId: string, jobId: string) =>
    applications().findOne({
      where: { candidate: { id: candidateId }, job: { id: jobId } },
      relations: ['candidate', 'job', 'job.organization'],
    }),

  forCandidate: async (candidateId: string, organizationId: string | null) => {
    const where = scopeWhere(organizationId, { application: { candidate: { id: candidateId } } });
    const [i, o, p, sc] = await Promise.all([
      interviews().find({ where, relations: APP_RELATIONS, order: { scheduledAt: 'DESC' } }),
      offers().find({ where, relations: APP_RELATIONS, order: { createdAt: 'DESC' } }),
      placements().find({ where, relations: APP_RELATIONS, order: { startDate: 'DESC' } }),
      scorecards().find({ where, relations: APP_RELATIONS, order: { round: 'ASC', createdAt: 'ASC' } }),
    ]);
    return {
      interviews: i.map(interviewToDto),
      offers: o.map(offerToDto),
      placements: p.map(placementToDto),
      scorecards: sc.map(scorecardToDto),
    };
  },

  upcomingInterviews: async (organizationId: string | null, from: Date, to: Date) => {
    const qb = interviews()
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.application', 'application')
      .leftJoinAndSelect('application.candidate', 'candidate')
      .leftJoinAndSelect('application.job', 'job')
      .leftJoinAndSelect('job.organization', 'organization')
      .where('i.status = :status', { status: 'SCHEDULED' })
      .andWhere('i."scheduledAt" BETWEEN :from AND :to', { from, to })
      .orderBy('i.scheduledAt', 'ASC')
      .take(100);
    if (organizationId) qb.andWhere('organization.id = :organizationId', { organizationId });
    return (await qb.getMany()).map(interviewToDto);
  },

  /** Offers awaiting the candidate's answer, for one org. */
  openOffers: async (organizationId: string) => {
    const rows = await offers().find({
      where: { status: 'EXTENDED', application: { job: { organization: { id: organizationId } } } },
      relations: APP_RELATIONS,
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return rows.map(offerToDto);
  },

  listPlacements: async (organizationId: string | null) => {
    const rows = await placements().find({
      where: scopeWhere(organizationId),
      relations: APP_RELATIONS,
      order: { startDate: 'DESC' },
      take: 500,
    });
    return rows.map(placementToDto);
  },

  // ---- single-record lookups (scope is checked by the service) --------------

  findInterview: async (id: string) => {
    const i = await interviews().findOne({ where: { id }, relations: APP_RELATIONS });
    return i ? interviewToDto(i) : null;
  },
  findOffer: async (id: string) => {
    const o = await offers().findOne({ where: { id }, relations: APP_RELATIONS });
    return o ? offerToDto(o) : null;
  },
  findPlacement: async (id: string) => {
    const p = await placements().findOne({ where: { id }, relations: APP_RELATIONS });
    return p ? placementToDto(p) : null;
  },

  createInterview: async (applicationId: string, data: Partial<Interview>) => {
    const saved = await interviews().save(interviews().create({ ...data, application: { id: applicationId } as Application }));
    return pipelineRepository.findInterview(saved.id);
  },
  updateInterview: async (id: string, data: Partial<Interview>) => {
    if (Object.keys(data).length) await interviews().update(id, data);
    return pipelineRepository.findInterview(id);
  },

  createOffer: async (applicationId: string, data: Partial<Offer>) => {
    const saved = await offers().save(offers().create({ ...data, application: { id: applicationId } as Application }));
    return pipelineRepository.findOffer(saved.id);
  },
  updateOffer: async (id: string, data: Partial<Offer>) => {
    if (Object.keys(data).length) await offers().update(id, data);
    return pipelineRepository.findOffer(id);
  },
  /** Any other still-open offers on the same application are superseded. */
  withdrawOtherOffers: async (applicationId: string, keepId: string) => {
    const open = await offers().find({ where: { application: { id: applicationId }, status: 'EXTENDED' } });
    const ids = open.filter((o) => o.id !== keepId).map((o) => o.id);
    if (ids.length) await offers().update({ id: In(ids) }, { status: 'WITHDRAWN' });
  },

  // ---- scorecards ----------------------------------------------------------------

  findScorecard: async (id: string) => {
    const s = await scorecards().findOne({ where: { id }, relations: APP_RELATIONS });
    return s ? scorecardToDto(s) : null;
  },

  /** Insert or update the author's scorecard for this application + round. */
  upsertScorecard: async (
    applicationId: string,
    round: number,
    author: { email: string; name?: string; role?: string },
    data: { ratings: ScorecardRating[]; recommendation: InterviewScorecard['recommendation']; summary?: string | null }
  ) => {
    const existing = await scorecards().findOne({
      where: { application: { id: applicationId }, round, authorEmail: author.email },
    });
    const saved = await scorecards().save(
      scorecards().create({
        ...(existing ? { id: existing.id } : {}),
        application: { id: applicationId } as Application,
        round,
        authorEmail: author.email,
        authorName: author.name,
        authorRole: author.role as InterviewScorecard['authorRole'],
        ratings: data.ratings,
        recommendation: data.recommendation,
        summary: data.summary ?? null,
      })
    );
    return { scorecard: await pipelineRepository.findScorecard(saved.id), created: !existing };
  },

  deleteScorecard: async (id: string) => {
    await scorecards().delete(id);
  },

  createPlacement: async (applicationId: string, data: Partial<Placement>) => {
    const saved = await placements().save(placements().create({ ...data, application: { id: applicationId } as Application }));
    return pipelineRepository.findPlacement(saved.id);
  },
  updatePlacement: async (id: string, data: Partial<Placement>) => {
    if (Object.keys(data).length) await placements().update(id, data);
    return pipelineRepository.findPlacement(id);
  },
};
