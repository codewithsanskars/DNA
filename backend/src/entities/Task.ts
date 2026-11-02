import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne } from 'typeorm';
import { RecordType, TaskPriority, TaskRecurrence, TaskStatus } from '../types';
import { RECORD_TYPES, TASK_PRIORITIES, TASK_RECURRENCES, TASK_STATUSES } from './enums';
import { User } from './User';

/** A unit of recruiter work (RC-70..RC-73), optionally attached to a record. */
@Entity('tasks')
@Index(['assignee', 'status'])
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  dueAt?: Date | null;

  @Column({ type: 'enum', enum: TASK_PRIORITIES, default: 'MEDIUM' })
  priority!: TaskPriority;

  @Column({ type: 'enum', enum: TASK_STATUSES, default: 'OPEN' })
  status!: TaskStatus;

  /** When a recurring task is completed, the next occurrence is created. */
  @Column({ type: 'enum', enum: TASK_RECURRENCES, default: 'NONE' })
  recurrence!: TaskRecurrence;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  assignee?: User | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  createdBy?: User | null;

  @Column({ type: 'enum', enum: RECORD_TYPES, nullable: true })
  recordType?: RecordType | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  recordId?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
