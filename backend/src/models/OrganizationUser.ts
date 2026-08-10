import { Schema, model } from 'mongoose';
import { IOrganizationUser } from '../types';

const organizationUserSchema = new Schema<IOrganizationUser>(
  {
    organizationId: { type: String, required: true },
    userId: { type: String, required: true },
    role: {
      type: String,
      enum: ['SWFS_ADMIN', 'SWFS_RECRUITER', 'CLIENT_ADMIN', 'HIRING_MANAGER', 'VIEWER'],
      required: true,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

organizationUserSchema.index({ organizationId: 1, userId: 1 }, { unique: true });

export const OrganizationUser = model<IOrganizationUser>('OrganizationUser', organizationUserSchema);
