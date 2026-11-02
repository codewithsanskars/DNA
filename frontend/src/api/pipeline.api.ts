import api from './axios';
import {
  ApiResponse,
  CandidateRecords,
  Interview,
  InterviewMode,
  InterviewStatus,
  Offer,
  OfferRateType,
  OfferStatus,
  Placement,
  PlacementStatus,
  Scorecard,
  ScorecardRecommendation,
  ScorecardTemplate,
} from '../types';

export interface InterviewInput {
  scheduledAt?: string;
  durationMinutes?: number;
  mode?: InterviewMode;
  location?: string;
  interviewers?: string;
  notes?: string;
  status?: InterviewStatus;
}

export interface OfferInput {
  amount?: number;
  currency?: string;
  rateType?: OfferRateType;
  startDate?: string;
  expiresAt?: string;
  notes?: string;
  status?: OfferStatus;
}

export interface PlacementInput {
  startDate?: string;
  endDate?: string | null;
  billRate?: number | null;
  payRate?: number | null;
  fee?: number | null;
  guaranteeDays?: number | null;
  notes?: string;
  status?: PlacementStatus;
}

/** Interviews & offers: clients + admins. Placements: admin-only writes. */
export const pipelineApi = {
  getCandidateRecords: async (candidateId: string): Promise<CandidateRecords> => {
    const res = await api.get<ApiResponse<CandidateRecords>>(`/pipeline/candidates/${candidateId}`);
    return res.data.data!;
  },

  getUpcomingInterviews: async (days = 14): Promise<Interview[]> => {
    const res = await api.get<ApiResponse<Interview[]>>('/pipeline/interviews/upcoming', { params: { days } });
    return res.data.data!;
  },

  getPlacements: async (): Promise<Placement[]> => {
    const res = await api.get<ApiResponse<Placement[]>>('/pipeline/placements');
    return res.data.data!;
  },

  scheduleInterview: async (candidateId: string, jobId: string, input: InterviewInput): Promise<Interview> => {
    const res = await api.post<ApiResponse<Interview>>('/pipeline/interviews', { candidateId, jobId, ...input });
    return res.data.data!;
  },

  updateInterview: async (id: string, input: InterviewInput): Promise<Interview> => {
    const res = await api.patch<ApiResponse<Interview>>(`/pipeline/interviews/${id}`, input);
    return res.data.data!;
  },

  getScorecardTemplate: async (): Promise<ScorecardTemplate> => {
    const res = await api.get<ApiResponse<ScorecardTemplate>>('/pipeline/scorecard-template');
    return res.data.data!;
  },

  /** Creates or updates the caller's scorecard for that round. */
  submitScorecard: async (input: {
    candidateId: string;
    jobId: string;
    round: number;
    ratings: { key: string; score: number | null; comment?: string }[];
    recommendation: ScorecardRecommendation;
    summary?: string;
  }): Promise<Scorecard> => {
    const res = await api.post<ApiResponse<Scorecard>>('/pipeline/scorecards', input);
    return res.data.data!;
  },

  deleteScorecard: async (id: string): Promise<void> => {
    await api.delete(`/pipeline/scorecards/${id}`);
  },

  extendOffer: async (candidateId: string, jobId: string, input: OfferInput): Promise<Offer> => {
    const res = await api.post<ApiResponse<Offer>>('/pipeline/offers', { candidateId, jobId, ...input });
    return res.data.data!;
  },

  updateOffer: async (id: string, input: OfferInput): Promise<Offer> => {
    const res = await api.patch<ApiResponse<Offer>>(`/pipeline/offers/${id}`, input);
    return res.data.data!;
  },

  createPlacement: async (candidateId: string, jobId: string, input: PlacementInput): Promise<Placement> => {
    const res = await api.post<ApiResponse<Placement>>('/pipeline/placements', { candidateId, jobId, ...input });
    return res.data.data!;
  },

  updatePlacement: async (id: string, input: PlacementInput): Promise<Placement> => {
    const res = await api.patch<ApiResponse<Placement>>(`/pipeline/placements/${id}`, input);
    return res.data.data!;
  },
};
