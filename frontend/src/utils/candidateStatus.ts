import { GlobalStatus, CandidateStatus } from '../types';

// Mirrors STATUS_OPTIONS_BY_GLOBAL_STATUS on the backend (entities/enums.ts).
// The first entry in each list is the default a candidate falls back to when
// their globalStatus changes without an explicit status being chosen.
export const STATUS_OPTIONS_BY_GLOBAL_STATUS: Record<GlobalStatus, CandidateStatus[]> = {
  OPEN: ['LOOKING'],
  SELECTED: ['SELECTED'],
  ONBOARDED: ['COMPANY', 'SWFS'],
  ARCHIVED: ['BLACKLISTED', 'OPPORTUNITY', 'OFFBOARDED', 'NOT_INTERESTED', 'CONTACTED'],
};
