import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne } from 'typeorm';
import { NoteKind, RecordType } from '../types';
import { NOTE_KINDS, RECORD_TYPES } from './enums';
import { User } from './User';

/**
 * A timeline entry on any record (RC-19 / RC-20 / RC-74): a free-text note
 * or a logged interaction (call, email, meeting, follow-up). Polymorphic on
 * (recordType, recordId) so candidates, jobs and organizations share one
 * timeline implementation. SWFS-internal — never served to CLIENT users.
 */
@Entity('record_notes')
@Index(['recordType', 'recordId'])
export class RecordNote {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: RECORD_TYPES })
  recordType!: RecordType;

  @Column({ type: 'uuid' })
  recordId!: string;

  @Column({ type: 'enum', enum: NOTE_KINDS, default: 'NOTE' })
  kind!: NoteKind;

  @Column({ type: 'text' })
  body!: string;

  /** When the interaction happened — defaults to creation time for plain notes. */
  @Column({ type: 'timestamptz', default: () => 'now()' })
  occurredAt!: Date;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  author?: User | null;

  @Column()
  authorEmail!: string;

  /** User ids @mentioned in the body. */
  @Column({ type: 'uuid', array: true, default: () => "'{}'" })
  mentions!: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
