import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne } from 'typeorm';
import { PlacementStatus } from '../types';
import { PLACEMENT_STATUSES } from './enums';
import { Application } from './Application';

/** A hire that has started work (RC-50). Created by SWFS staff. */
@Entity('placements')
export class Placement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Application, { onDelete: 'CASCADE' })
  application!: Application;

  @Column({ type: 'date' })
  startDate!: string;

  @Column({ type: 'date', nullable: true })
  endDate?: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  billRate?: number | null;

  // SWFS-internal — stripped from CLIENT responses.
  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  payRate?: number | null;

  /** One-off placement fee (perm hires). */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  fee?: number | null;

  /** Replacement-guarantee window in days. */
  @Column({ type: 'int', nullable: true })
  guaranteeDays?: number | null;

  @Column({ type: 'enum', enum: PLACEMENT_STATUSES, default: 'ACTIVE' })
  status!: PlacementStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column()
  createdByEmail!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
