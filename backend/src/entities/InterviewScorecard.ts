import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne } from 'typeorm';
import { UserRole } from '../types';
import { ScorecardRecommendation, SCORECARD_RECOMMENDATIONS, USER_ROLES } from './enums';
import { Application } from './Application';

export interface ScorecardRating {
  key: string;
  /** Label at the time of scoring, so wording changes don't rewrite history. */
  label: string;
  /** 1–5, or null when the interviewer couldn't assess it. */
  score: number | null;
  comment?: string;
}

/**
 * One interviewer's structured assessment of one interview round. Unique
 * per (application, round, author) — re-submitting edits it.
 */
@Entity('interview_scorecards')
@Index(['application', 'round', 'authorEmail'], { unique: true })
export class InterviewScorecard {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Application, { onDelete: 'CASCADE' })
  application!: Application;

  @Column({ type: 'int' })
  round!: number;

  @Column()
  authorEmail!: string;

  @Column({ nullable: true })
  authorName?: string;

  @Column({ type: 'enum', enum: USER_ROLES, nullable: true })
  authorRole?: UserRole;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  ratings!: ScorecardRating[];

  @Column({ type: 'enum', enum: SCORECARD_RECOMMENDATIONS })
  recommendation!: ScorecardRecommendation;

  @Column({ type: 'text', nullable: true })
  summary?: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
