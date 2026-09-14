import { UserRole } from '../types';

// The portal has exactly two groups: SWFS staff (ADMIN), who work across every
// client organization, and client users (CLIENT), scoped to their own org.
export const ADMIN_ROLES: UserRole[] = ['ADMIN'];

export function isAdminRole(role?: UserRole): boolean {
  return role === 'ADMIN';
}
