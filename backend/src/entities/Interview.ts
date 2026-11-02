import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne } from 'typeorm';
import { InterviewMode, InterviewStatus } from '../types';
import { INTERVIEW_MODES, INTERVIEW_STATUSES } from './enums';
import { Application } from './Application';

/** A scheduled interview round for one candidate-job application (RC-47). */
@Entity('interviews')
export class Interview {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Application, { onDelete: 'CASCADE' })
  application!: Application;

  @Column({ type: 'int' })
  round!: number;

  @Column({ type: 'timestamptz' })
  scheduledAt!: Date;

  @Column({ type: 'int', default: 60 })
  durationMinutes!: number;

  @Column({ type: 'enum', enum: INTERVIEW_MODES, default: 'VIDEO' })
  mode!: InterviewMode;

  /** Meeting link or street address, depending on mode. */
  @Column({ nullable: true })
  location?: string;

  /** Free-text panel list, e.g. "Jane Doe (EM), Raj Patel (Staff Eng)". */
  @Column({ type: 'text', nullable: true })
  interviewers?: string;

  @Column({ type: 'enum', enum: INTERVIEW_STATUSES, default: 'SCHEDULED' })
  status!: InterviewStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column()
  createdByEmail!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
