import { Schema, model } from 'mongoose';
import { IJobCache } from '../types';

const jobCacheSchema = new Schema<IJobCache>(
  {
    recruitCrmId: { type: String, required: true },
    organizationId: { type: String, required: true },
    title: { type: String, required: true },
    department: { type: String },
    location: { type: String },
    status: { type: String, enum: ['OPEN', 'CLOSED', 'ON_HOLD'], default: 'OPEN' },
    totalCandidates: { type: Number, default: 0 },
    openedAt: { type: Date },
    syncedAt: { type: Date, default: Date.now },
    rawData: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

jobCacheSchema.index({ organizationId: 1 });
jobCacheSchema.index({ recruitCrmId: 1, organizationId: 1 }, { unique: true });

export const JobCache = model<IJobCache>('JobCache', jobCacheSchema);
