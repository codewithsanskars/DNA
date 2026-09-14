import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
import { UserRole } from '../types';
import { USER_ROLES } from './enums';
import { Candidate } from './Candidate';

/** A note (and optional 1–5 rating) left on a candidate by a portal user. */
@Entity('candidate_feedback')
export class CandidateFeedback {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Candidate, (candidate) => candidate.feedback, { onDelete: 'CASCADE' })
  candidate!: Candidate;

  @Column()
  authorEmail!: string;

  @Column({ type: 'enum', enum: USER_ROLES, nullable: true })
  authorRole?: UserRole;

  @Column({ type: 'text' })
  comment!: string;

  @Column({ type: 'int', nullable: true })
  rating?: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
