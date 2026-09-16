import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { OrganizationContact } from './OrganizationContact';
import { OrganizationMembership } from './OrganizationMembership';
import { Job } from './Job';

/** A client company that SWFS recruits for. */
@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Index({ unique: true })
  @Column()
  slug!: string;

  @Column({ nullable: true })
  industry?: string;

  @Column({ nullable: true })
  website?: string;

  @Column({ nullable: true })
  logoUrl?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ nullable: true })
  hq?: string;

  @Column({ type: 'int', nullable: true })
  employeeCount?: number;

  @Column({ nullable: true })
  founded?: string;

  @Column({ type: 'jsonb', nullable: true })
  socialLinks?: { linkedin?: string; twitter?: string; facebook?: string; instagram?: string };

  @Column({ default: true })
  isActive!: boolean;

  @OneToMany(() => OrganizationContact, (contact) => contact.organization, { cascade: true })
  contacts!: OrganizationContact[];

  @OneToMany(() => OrganizationMembership, (membership) => membership.organization)
  memberships!: OrganizationMembership[];

  @OneToMany(() => Job, (job) => job.organization)
  jobs!: Job[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
