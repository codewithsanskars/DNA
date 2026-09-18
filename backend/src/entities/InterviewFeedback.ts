import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
import { UserRole } from '../types';
import { USER_ROLES } from './enums';
import { Application } from './Application';

/** A note (and optional 1-5 rating) left against a specific interview round
 *  for a candidate's application to a role — distinct from CandidateFeedback,
 *  which is general and not scoped to a role or round. */
@Entity('interview_feedback')
export class InterviewFeedback {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Application, { onDelete: 'CASCADE' })
  application!: Application;

  @Column({ type: 'int' })
  round!: number;

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
