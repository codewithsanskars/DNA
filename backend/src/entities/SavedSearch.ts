import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
import { User } from './User';

/** A named candidate-search query a recruiter can re-run (RC-25). */
@Entity('saved_searches')
export class SavedSearch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user!: User;

  @Column()
  name!: string;

  /** The search params exactly as the search endpoint accepts them. */
  @Column({ type: 'jsonb' })
  params!: Record<string, string>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
