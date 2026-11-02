import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne } from 'typeorm';
import { User } from './User';

/**
 * An in-app notification for one user. Created by the notification
 * dispatcher from audited actions (see services/notification.service.ts) —
 * never written directly by a request.
 */
@Entity('notifications')
@Index(['recipient', 'readAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  recipient!: User;

  /** Machine-readable kind, e.g. CLIENT_SHORTLISTED — drives the icon. */
  @Column()
  type!: string;

  @Column()
  title!: string;

  @Column({ type: 'text', nullable: true })
  body?: string | null;

  /** Frontend path to open, e.g. /candidates/:id. */
  @Column({ type: 'varchar', nullable: true })
  link?: string | null;

  @Column({ type: 'varchar', nullable: true })
  actorName?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  readAt?: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
