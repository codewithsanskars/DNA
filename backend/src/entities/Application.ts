import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
} from 'typeorm';
import { CandidateStage } from '../types';
import { CANDIDATE_STAGES } from './enums';
import { Candidate } from './Candidate';
import { Job } from './Job';

/**
 * A candidate linked to a job — the "job link" in portal language.
 * One row per (candidate, job) pair; `stage` is the pipeline position for
 * that specific role.
 */
@Entity('applications')
@Index(['candidate', 'job'], { unique: true })
export class Application {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Candidate, (candidate) => candidate.applications, { onDelete: 'CASCADE' })
  candidate!: Candidate;

  @ManyToOne(() => Job, (job) => job.applications, { onDelete: 'CASCADE' })
  job!: Job;

  @Column({ type: 'enum', enum: CANDIDATE_STAGES, default: 'APPLIED' })
  stage!: CandidateStage;

  /** When `stage` last changed — powers time-in-stage / stalled-candidate metrics. */
  @Column({ type: 'timestamptz', default: () => 'now()' })
  stageUpdatedAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  appliedAt!: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
