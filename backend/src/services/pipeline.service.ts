import { pipelineRepository, PlacementDto } from '../repositories/pipeline.repository';
import { candidateRepository } from '../repositories/candidate.repository';
import { candidateService } from './candidate.service';
import { userRepository } from '../repositories/user.repository';
import { Interview, Offer, Placement } from '../entities';
import { InterviewStatus, OfferStatus, PlacementStatus } from '../types';
import { badRequest, forbidden, notFound } from '../utils/http';
import { isClientVisible } from '../utils/clientVisibility';
import { SCORECARD_CRITERIA, ScorecardRecommendation } from '../entities/enums';
import { ScorecardRating } from '../entities/InterviewScorecard';

const MAX_ROUNDS = 3;

/** Placement pay rate is SWFS-internal — removed for CLIENT callers. */
export function scopePlacement<T extends PlacementDto | null>(p: T, isAdmin: boolean): T {
  if (!p || isAdmin) return p;
  const { payRate: _hidden, ...rest } = p;
  return rest as T;
}

async function requireApplication(candidateId: string, jobId: string, organizationId: string | null) {
  const app = await pipelineRepository.findApplication(candidateId, jobId);
  if (!app || (organizationId && (app.job.organization?.id !== organizationId || !isClientVisible(app)))) {
    throw notFound('Candidate is not linked to this role');
  }
  return app;
}

function assertInScope(record: { organizationId: string | null } | null, organizationId: string | null, label: string) {
  if (!record || (organizationId && record.organizationId !== organizationId)) throw notFound(`${label} not found`);
}

export const pipelineService = {
  forCandidate: async (candidateId: string, organizationId: string | null) => {
    const data = await pipelineRepository.forCandidate(candidateId, organizationId);
    return { ...data, placements: data.placements.map((p) => scopePlacement(p, !organizationId)) };
  },

  upcomingInterviews: async (organizationId: string | null, days = 14) => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
    return pipelineRepository.upcomingInterviews(organizationId, from, to);
  },

  listPlacements: async (organizationId: string | null) =>
    (await pipelineRepository.listPlacements(organizationId)).map((p) => scopePlacement(p, !organizationId)),

  // ---- Interviews (RC-47) — clients and admins ------------------------------

  /** Scheduling a round advances the application to INTERVIEW and bumps its round. */
  scheduleInterview: async (
    candidateId: string,
    jobId: string,
    organizationId: string | null,
    createdByEmail: string,
    data: Partial<Interview>
  ) => {
    const app = await requireApplication(candidateId, jobId, organizationId);
    if (app.interviewRound >= MAX_ROUNDS) throw badRequest(`All ${MAX_ROUNDS} interview rounds have already been scheduled`);
    if (['REJECTED', 'HIRED'].includes(app.stage)) throw badRequest(`Can't schedule an interview for a ${app.stage.toLowerCase()} candidate`);
    await candidateRepository.advanceInterviewRound(candidateId, jobId);
    return pipelineRepository.createInterview(app.id, { ...data, round: app.interviewRound + 1, createdByEmail });
  },

  updateInterview: async (id: string, organizationId: string | null, data: Partial<Interview>) => {
    assertInScope(await pipelineRepository.findInterview(id), organizationId, 'Interview');
    return pipelineRepository.updateInterview(id, data);
  },

  // ---- Scorecards — clients and admins ---------------------------------------

  scorecardTemplate: () => ({ criteria: SCORECARD_CRITERIA, scale: { min: 1, max: 5 } }),

  /**
   * Structured feedback for one round, one per interviewer (re-submitting
   * edits it). Only rounds that have actually been scheduled can be scored.
   * Ratings are normalised against the template so unknown keys are dropped
   * and every criterion appears exactly once.
   */
  submitScorecard: async (
    candidateId: string,
    jobId: string,
    round: number,
    organizationId: string | null,
    author: { userId: string; email: string; role?: string },
    data: { ratings: { key: string; score: number | null; comment?: string }[]; recommendation: ScorecardRecommendation; summary?: string | null }
  ) => {
    const app = await requireApplication(candidateId, jobId, organizationId);
    if (round < 1 || round > app.interviewRound) throw badRequest(`Round ${round} hasn't been scheduled for this role`);
    const byKey = new Map(data.ratings.map((r) => [r.key, r]));
    const ratings: ScorecardRating[] = SCORECARD_CRITERIA.map((c) => {
      const r = byKey.get(c.key);
      return { key: c.key, label: c.label, score: r?.score ?? null, comment: r?.comment?.trim() || undefined };
    });
    if (!ratings.some((r) => r.score != null)) throw badRequest('Score at least one criterion');
    const name = (await userRepository.findById(author.userId))?.name ?? author.email;
    return pipelineRepository.upsertScorecard(app.id, round, { email: author.email, name, role: author.role }, { ratings, recommendation: data.recommendation, summary: data.summary });
  },

  /** Only the author can remove their scorecard. */
  deleteScorecard: async (id: string, organizationId: string | null, requesterEmail: string) => {
    const sc = await pipelineRepository.findScorecard(id);
    assertInScope(sc, organizationId, 'Scorecard');
    if (sc!.authorEmail !== requesterEmail) throw forbidden('You can only delete your own scorecard');
    await pipelineRepository.deleteScorecard(id);
    return sc!;
  },

  // ---- Offers (RC-49) — clients and admins ----------------------------------

  /** Extending an offer runs the existing "select candidate" flow. */
  extendOffer: async (
    candidateId: string,
    jobId: string,
    organizationId: string | null,
    createdByEmail: string,
    data: Partial<Offer>
  ) => {
    const app = await requireApplication(candidateId, jobId, organizationId);
    if (['REJECTED', 'HIRED'].includes(app.stage)) throw badRequest(`Can't extend an offer to a ${app.stage.toLowerCase()} candidate`);
    await candidateService.selectCandidateForJob(candidateId, jobId, organizationId);
    const offer = await pipelineRepository.createOffer(app.id, { ...data, status: 'EXTENDED', createdByEmail });
    await pipelineRepository.withdrawOtherOffers(app.id, offer!.id);
    return offer;
  },

  /**
   * Offer status changes carry their pipeline consequences: accepted moves
   * the candidate to Selected › Accepted; declined rejects the application
   * (reason OFFER_DECLINED) and returns the candidate to the open pool.
   */
  updateOffer: async (id: string, organizationId: string | null, data: Partial<Offer> & { status?: OfferStatus }) => {
    const offer = await pipelineRepository.findOffer(id);
    assertInScope(offer, organizationId, 'Offer');
    const statusChanged = data.status && data.status !== offer!.status;
    const updated = await pipelineRepository.updateOffer(id, {
      ...data,
      ...(statusChanged && data.status !== 'EXTENDED' ? { respondedAt: new Date() } : {}),
    });
    if (statusChanged) {
      const { candidateId, jobId } = offer!;
      if (data.status === 'ACCEPTED') {
        await candidateRepository.updateGlobalStatus(candidateId!, 'SELECTED', 'ACCEPTED');
      } else if (data.status === 'DECLINED') {
        await candidateRepository.updateStageForJob(candidateId!, jobId!, 'REJECTED', { reason: 'OFFER_DECLINED' });
        await candidateRepository.updateGlobalStatus(candidateId!, 'OPEN', 'LOOKING');
      }
    }
    return updated;
  },

  // ---- Placements (RC-50) — admin only --------------------------------------

  /**
   * Recording a placement marks the application HIRED and the candidate
   * Onboarded (on SWFS or company payroll, per the role's payroll type).
   * Rates default to the role's own bill / pay rate.
   */
  createPlacement: async (candidateId: string, jobId: string, createdByEmail: string, data: Partial<Placement>) => {
    const app = await requireApplication(candidateId, jobId, null);
    if (app.stage === 'REJECTED') throw badRequest('Can’t place a rejected candidate');
    const placement = await pipelineRepository.createPlacement(app.id, {
      billRate: app.job.billRate ?? null,
      payRate: app.job.payRate ?? null,
      ...data,
      status: 'ACTIVE',
      createdByEmail,
    });
    await candidateRepository.updateStageForJob(candidateId, jobId, 'HIRED');
    await candidateRepository.updateGlobalStatus(candidateId, 'ONBOARDED', app.job.payrollType === 'IN_HOUSE' ? 'COMPANY' : 'SWFS');
    return placement;
  },

  /** Ending a placement (completed or terminated) offboards the candidate. */
  updatePlacement: async (id: string, data: Partial<Placement> & { status?: PlacementStatus }) => {
    const placement = await pipelineRepository.findPlacement(id);
    if (!placement) throw notFound('Placement not found');
    const updated = await pipelineRepository.updatePlacement(id, data);
    if (data.status && data.status !== placement.status && data.status !== 'ACTIVE') {
      await candidateRepository.updateGlobalStatus(placement.candidateId!, 'ARCHIVED', 'OFFBOARDED');
    }
    return updated;
  },
};

export type { InterviewStatus };
