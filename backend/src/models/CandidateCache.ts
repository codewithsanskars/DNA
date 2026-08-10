import { Schema, model } from 'mongoose';
import { ICandidateCache } from '../types';

const candidateCacheSchema = new Schema<ICandidateCache>(
  {
    recruitCrmId: { type: String, required: true },
    organizationId: { type: String, required: true },
    jobId: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String },
    currentTitle: { type: String },
    currentCompany: { type: String },
    location: { type: String },
    stage: {
      type: String,
      enum: ['APPLIED', 'SCREENING', 'INTERVIEW', 'SHORTLISTED', 'OFFER', 'HIRED', 'REJECTED'],
      default: 'APPLIED',
    },
    skills: [{ type: String }],
    resumeUrl: { type: String },
    linkedinUrl: { type: String },
    notes: { type: String },
    clientRating: { type: Number, min: 1, max: 5 },
    syncedAt: { type: Date, default: Date.now },
    rawData: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

candidateCacheSchema.index({ organizationId: 1, jobId: 1 });
candidateCacheSchema.index({ recruitCrmId: 1, organizationId: 1 }, { unique: true });

export const CandidateCache = model<ICandidateCache>('CandidateCache', candidateCacheSchema);
