import { Schema, model } from 'mongoose';
import { IOrganization } from '../types';

const organizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    attioId: { type: String },
    industry: { type: String },
    website: { type: String },
    logoUrl: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Organization = model<IOrganization>('Organization', organizationSchema);
