import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { pipelineService, scopePlacement } from '../services/pipeline.service';
import { auditLogService } from '../services/auditLog.service';
import {
  INTERVIEW_MODES,
  INTERVIEW_STATUSES,
  OFFER_RATE_TYPES,
  OFFER_STATUSES,
  PLACEMENT_STATUSES,
  SCORECARD_RECOMMENDATIONS,
} from '../entities/enums';
import {
  badRequest,
  isAdminRequest,
  optionalDate,
  optionalEnum,
  optionalNumber,
  optionalString,
  optionalUuid,
  orgScopeOf,
} from '../utils/http';

function applicationRef(body: Record<string, unknown>) {
  const candidateId = optionalUuid(body.candidateId, 'candidateId');
  const jobId = optionalUuid(body.jobId, 'jobId');
  if (!candidateId || !jobId) throw badRequest('candidateId and jobId are required');
  return { candidateId, jobId };
}

/** Removes undefined keys so partial updates only touch what was sent. */
function defined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function interviewFields(body: Record<string, unknown>) {
  const scheduledAt = optionalDate(body.scheduledAt, 'Interview time');
  return defined({
    scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
    durationMinutes: optionalNumber(body.durationMinutes, 'Duration', { min: 5, max: 600, integer: true }) ?? undefined,
    mode: optionalEnum(body.mode, INTERVIEW_MODES, 'Mode') ?? undefined,
    location: optionalString(body.location, 'Location / link', 500),
    interviewers: optionalString(body.interviewers, 'Interviewers', 1000),
    notes: optionalString(body.notes, 'Notes', 5000),
    status: optionalEnum(body.status, INTERVIEW_STATUSES, 'Status') ?? undefined,
  });
}

function offerFields(body: Record<string, unknown>) {
  const currency = optionalString(body.currency, 'Currency', 3);
  if (currency && !/^[A-Za-z]{3}$/.test(currency)) throw badRequest('Currency must be a 3-letter code like USD');
  return defined({
    amount: optionalNumber(body.amount, 'Amount', { min: 0, max: 100_000_000 }) ?? undefined,
    currency: currency ? currency.toUpperCase() : undefined,
    rateType: optionalEnum(body.rateType, OFFER_RATE_TYPES, 'Rate type') ?? undefined,
    startDate: optionalDate(body.startDate, 'Start date')?.slice(0, 10),
    expiresAt: optionalDate(body.expiresAt, 'Expiry date')?.slice(0, 10),
    notes: optionalString(body.notes, 'Notes', 5000),
    status: optionalEnum(body.status, OFFER_STATUSES, 'Status') ?? undefined,
  });
}

function placementFields(body: Record<string, unknown>) {
  const endDate = optionalDate(body.endDate, 'End date');
  return defined({
    startDate: optionalDate(body.startDate, 'Start date')?.slice(0, 10),
    endDate: endDate === null ? null : endDate?.slice(0, 10),
    billRate: optionalNumber(body.billRate, 'Bill rate', { min: 0, max: 100_000 }),
    payRate: optionalNumber(body.payRate, 'Pay rate', { min: 0, max: 100_000 }),
    fee: optionalNumber(body.fee, 'Placement fee', { min: 0, max: 100_000_000 }),
    guaranteeDays: optionalNumber(body.guaranteeDays, 'Guarantee period', { min: 0, max: 3650, integer: true }),
    notes: optionalString(body.notes, 'Notes', 5000),
    status: optionalEnum(body.status, PLACEMENT_STATUSES, 'Status') ?? undefined,
  });
}

/** Interviews, offers and placements on a candidate's applications. */
export const pipelineController = {
  forCandidate: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      res.json({ success: true, data: await pipelineService.forCandidate(req.params.candidateId, orgScopeOf(req)) });
    } catch (err) {
      next(err);
    }
  },

  upcomingInterviews: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const days = optionalNumber(req.query.days, 'Days', { min: 1, max: 90, integer: true }) ?? 14;
      res.json({ success: true, data: await pipelineService.upcomingInterviews(orgScopeOf(req), days) });
    } catch (err) {
      next(err);
    }
  },

  listPlacements: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      res.json({ success: true, data: await pipelineService.listPlacements(orgScopeOf(req)) });
    } catch (err) {
      next(err);
    }
  },

  scheduleInterview: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { candidateId, jobId } = applicationRef(req.body);
      const fields = interviewFields(req.body);
      if (!fields.scheduledAt) throw badRequest('Interview time is required');
      const interview = await pipelineService.scheduleInterview(candidateId, jobId, orgScopeOf(req), req.user!.email, fields);
      await auditLogService.log(req.user!, 'SCHEDULE_INTERVIEW', 'candidate', candidateId, {
        jobId,
        round: interview?.round,
        scheduledAt: fields.scheduledAt,
      });
      res.status(201).json({ success: true, data: interview });
    } catch (err) {
      next(err);
    }
  },

  updateInterview: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const interview = await pipelineService.updateInterview(req.params.id, orgScopeOf(req), interviewFields(req.body));
      await auditLogService.log(req.user!, 'UPDATE_INTERVIEW', 'candidate', interview!.candidateId!, {
        interviewId: interview!.id,
        ...req.body,
      });
      res.json({ success: true, data: interview });
    } catch (err) {
      next(err);
    }
  },

  scorecardTemplate: (_req: AuthenticatedRequest, res: Response) => {
    res.json({ success: true, data: pipelineService.scorecardTemplate() });
  },

  submitScorecard: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { candidateId, jobId } = applicationRef(req.body);
      const round = optionalNumber(req.body.round, 'Round', { min: 1, max: 10, integer: true });
      if (!round) throw badRequest('round is required');
      const recommendation = optionalEnum(req.body.recommendation, SCORECARD_RECOMMENDATIONS, 'Recommendation');
      if (!recommendation) throw badRequest('Choose an overall recommendation');
      if (!Array.isArray(req.body.ratings)) throw badRequest('ratings must be a list');
      const ratings = (req.body.ratings as Record<string, unknown>[]).slice(0, 20).map((r, i) => ({
        key: String(r?.key ?? ''),
        score: optionalNumber(r?.score, `Score ${i + 1}`, { min: 1, max: 5, integer: true }) ?? null,
        comment: optionalString(r?.comment, 'Comment', 2000),
      }));
      const { scorecard, created } = await pipelineService.submitScorecard(
        candidateId,
        jobId,
        round,
        orgScopeOf(req),
        { userId: req.user!.userId, email: req.user!.email, role: req.user!.role },
        { ratings, recommendation, summary: optionalString(req.body.summary, 'Summary', 5000) || null }
      );
      await auditLogService.log(req.user!, created ? 'SUBMIT_SCORECARD' : 'UPDATE_SCORECARD', 'candidate', candidateId, {
        jobId,
        round,
        recommendation,
        overall: scorecard?.overall,
      });
      res.status(created ? 201 : 200).json({ success: true, data: scorecard });
    } catch (err) {
      next(err);
    }
  },

  deleteScorecard: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const sc = await pipelineService.deleteScorecard(req.params.id, orgScopeOf(req), req.user!.email);
      await auditLogService.log(req.user!, 'DELETE_SCORECARD', 'candidate', sc.candidateId!, { jobId: sc.jobId, round: sc.round });
      res.json({ success: true, data: { id: req.params.id } });
    } catch (err) {
      next(err);
    }
  },

  extendOffer: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { candidateId, jobId } = applicationRef(req.body);
      const fields = offerFields(req.body);
      if (fields.amount === undefined) throw badRequest('Offer amount is required');
      delete fields.status;
      const offer = await pipelineService.extendOffer(candidateId, jobId, orgScopeOf(req), req.user!.email, fields);
      await auditLogService.log(req.user!, 'EXTEND_OFFER', 'candidate', candidateId, { jobId, offerId: offer?.id });
      res.status(201).json({ success: true, data: offer });
    } catch (err) {
      next(err);
    }
  },

  updateOffer: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const offer = await pipelineService.updateOffer(req.params.id, orgScopeOf(req), offerFields(req.body));
      await auditLogService.log(req.user!, 'UPDATE_OFFER', 'candidate', offer!.candidateId!, {
        offerId: offer!.id,
        status: offer!.status,
      });
      res.json({ success: true, data: offer });
    } catch (err) {
      next(err);
    }
  },

  createPlacement: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { candidateId, jobId } = applicationRef(req.body);
      const fields = placementFields(req.body);
      if (!fields.startDate) throw badRequest('Start date is required');
      delete fields.status;
      const placement = await pipelineService.createPlacement(candidateId, jobId, req.user!.email, fields as never);
      await auditLogService.log(req.user!, 'CREATE_PLACEMENT', 'candidate', candidateId, { jobId, placementId: placement?.id });
      res.status(201).json({ success: true, data: scopePlacement(placement, isAdminRequest(req)) });
    } catch (err) {
      next(err);
    }
  },

  updatePlacement: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const placement = await pipelineService.updatePlacement(req.params.id, placementFields(req.body) as never);
      await auditLogService.log(req.user!, 'UPDATE_PLACEMENT', 'candidate', placement!.candidateId!, {
        placementId: placement!.id,
        status: placement!.status,
      });
      res.json({ success: true, data: placement });
    } catch (err) {
      next(err);
    }
  },
};
