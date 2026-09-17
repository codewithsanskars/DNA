import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { JobStatus, JobPriority, WorkType, PayrollType } from '../types';
import { JOB_STATUSES, JOB_PRIORITIES, WORK_TYPES, PAYROLL_TYPES } from './enums';
import { Organization } from './Organization';
import { Application } from './Application';

/** An open (or closed) role a client is hiring for. */
@Entity('jobs')
export class Job {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @ManyToOne(() => Organization, (organization) => organization.jobs, { onDelete: 'CASCADE' })
  organization!: Organization;

  @Column()
  title!: string;

  @Column({ nullable: true })
  department?: string;

  @Column({ nullable: true })
  location?: string;

  @Column({ type: 'enum', enum: JOB_STATUSES, default: 'OPEN' })
  status!: JobStatus;

  /** How urgently this role needs to be filled — set by the client at creation, editable any time. */
  @Column({ type: 'enum', enum: JOB_PRIORITIES, default: 'MEDIUM' })
  priority!: JobPriority;

  @Column({ type: 'timestamptz', nullable: true })
  openedAt?: Date;

  @Column({ type: 'text', nullable: true })
  description?: string;

  // Cost paid to the candidate/contractor — SWFS-internal, never shown to
  // client users. Given its own DB column name (rather than reusing the old
  // free-text "payRate" varchar column) so synchronize can add it and drop
  // the old column outright instead of attempting an unsafe varchar->numeric
  // cast on existing "$70 - $85/hr"-style data.
  @Column({ name: 'payRateAmount', type: 'numeric', precision: 10, scale: 2, nullable: true })
  payRate?: number;

  // Rate charged to the client. Visible to both roles — it's the only rate a
  // client sees; admins also see payRate and the gross margin between them.
  @Column({ name: 'billRateAmount', type: 'numeric', precision: 10, scale: 2, nullable: true })
  billRate?: number;

  @Column({ nullable: true })
  billableHours?: string;

  @Column({ type: 'enum', enum: WORK_TYPES, nullable: true })
  workType?: WorkType;

  @Column({ type: 'enum', enum: PAYROLL_TYPES, nullable: true })
  payrollType?: PayrollType;

  // Stores the on-disk filename under uploads/job-descriptions/ (see
  // upload.middleware.ts), not a public URL — the JD is only ever served
  // through the authenticated /jobs/:id/description route.
  @Column({ nullable: true })
  jdUrl?: string;

  // Original filename the job description was uploaded with, for display and download.
  @Column({ nullable: true })
  jdFileName?: string;

  /** Denormalised counter — number of applications linked to this job. */
  @Column({ type: 'int', default: 0 })
  totalCandidates!: number;

  @OneToMany(() => Application, (application) => application.job)
  applications!: Application[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
