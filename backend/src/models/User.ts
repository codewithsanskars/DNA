import { Schema, model } from 'mongoose';
import { IUser } from '../types';

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    role: {
      type: String,
      enum: ['SWFS_ADMIN', 'SWFS_RECRUITER', 'CLIENT_ADMIN', 'HIRING_MANAGER', 'VIEWER'],
      default: 'VIEWER',
    },
    oktaId: { type: String },
    avatarUrl: { type: String },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

export const User = model<IUser>('User', userSchema);
