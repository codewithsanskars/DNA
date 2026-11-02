import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne } from 'typeorm';
import { OfferRateType, OfferStatus } from '../types';
import { OFFER_RATE_TYPES, OFFER_STATUSES } from './enums';
import { Application } from './Application';

/** An offer extended on an application (RC-49). */
@Entity('offers')
export class Offer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Application, { onDelete: 'CASCADE' })
  application!: Application;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount!: number;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency!: string;

  @Column({ type: 'enum', enum: OFFER_RATE_TYPES, default: 'ANNUAL' })
  rateType!: OfferRateType;

  @Column({ type: 'date', nullable: true })
  startDate?: string;

  @Column({ type: 'date', nullable: true })
  expiresAt?: string;

  @Column({ type: 'enum', enum: OFFER_STATUSES, default: 'EXTENDED' })
  status!: OfferStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column()
  createdByEmail!: string;

  @Column({ type: 'timestamptz', nullable: true })
  respondedAt?: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
