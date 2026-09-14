import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
} from 'typeorm';
import { UserRole } from '../types';
import { USER_ROLES } from './enums';
import { Organization } from './Organization';
import { User } from './User';

/** Join row: which role a user holds at a given organization. */
@Entity('organization_memberships')
@Index(['organization', 'user'], { unique: true })
export class OrganizationMembership {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Organization, (organization) => organization.memberships, { onDelete: 'CASCADE' })
  organization!: Organization;

  @ManyToOne(() => User, (user) => user.memberships, { onDelete: 'CASCADE' })
  user!: User;

  @Column({ type: 'enum', enum: USER_ROLES })
  role!: UserRole;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
