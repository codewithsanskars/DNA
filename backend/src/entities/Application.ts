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
import { CandidateStage, RejectionReason } from '../types';
import { CANDIDATE_STAGES, REJECTION_REASONS } from './enums';
import { Candidate } from './Candidate';
import { Job } from './Job';
import { InterviewFeedback } from './InterviewFeedback';

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

  /** How many interview rounds have been scheduled for this role (0-3). Stage
   *  stays 'INTERVIEW' across all three rounds — this drives which round the
   *  pipeline UI is on without adding per-round stage values. */
  @Column({ type: 'int', default: 0 })
  interviewRound!: number;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  appliedAt!: Date;

  /** When SWFS submitted this candidate to the client (RC-41 / RC-45). */
  @Column({ type: 'timestamptz', nullable: true })
  submittedAt?: Date | null;

  @Column({ type: 'varchar', nullable: true })
  submittedByEmail?: string | null;

  /** The recruiter's pitch sent with the submission — visible to the client. */
  @Column({ type: 'text', nullable: true })
  submissionNote?: string | null;

  /** First time a client user opened the candidate after submission. */
  @Column({ type: 'timestamptz', nullable: true })
  clientViewedAt?: Date | null;

  /** Why this application was rejected (RC-46) — set alongside stage REJECTED. */
  @Column({ type: 'enum', enum: REJECTION_REASONS, nullable: true })
  rejectionReason?: RejectionReason | null;

  @Column({ type: 'text', nullable: true })
  rejectionNote?: string | null;

  @OneToMany(() => InterviewFeedback, (feedback) => feedback.application, { cascade: true })
  interviewFeedback!: InterviewFeedback[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
