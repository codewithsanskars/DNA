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
import { JobStatus, WorkType, PayrollType } from '../types';
import { JOB_STATUSES, WORK_TYPES, PAYROLL_TYPES } from './enums';
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

  @Column({ type: 'timestamptz', nullable: true })
  openedAt?: Date;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ nullable: true })
  payRate?: string;

  @Column({ nullable: true })
  billableHours?: string;

  @Column({ type: 'enum', enum: WORK_TYPES, nullable: true })
  workType?: WorkType;

  @Column({ type: 'enum', enum: PAYROLL_TYPES, nullable: true })
  payrollType?: PayrollType;

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
