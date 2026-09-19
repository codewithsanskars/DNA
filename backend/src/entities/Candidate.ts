import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { CandidateSource, GlobalStatus, CandidateStatus } from '../types';
import { CANDIDATE_SOURCES, GLOBAL_STATUSES } from './enums';
import { Application } from './Application';
import { CandidateFeedback } from './CandidateFeedback';

/** A person in the pipeline. Their only link to a client is via the roles
 *  (Applications) they're linked to — a candidate has no org of its own. */
@Entity('candidates')
export class Candidate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  firstName!: string;

  @Column()
  lastName!: string;

  @Index()
  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  currentTitle?: string;

  @Column({ nullable: true })
  currentCompany?: string;

  @Column({ nullable: true })
  location?: string;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  skills!: string[];

  // Stores the on-disk filename under uploads/resumes/ (see upload.middleware.ts),
  // not a public URL — resumes are only ever served through the authenticated
  // /candidates/:id/resume route.
  @Column({ nullable: true })
  resumeUrl?: string;

  // Original filename the resume/CV was uploaded with, for display and download.
  @Column({ nullable: true })
  resumeFileName?: string;

  @Column({ nullable: true })
  linkedinUrl?: string;

  @Column({ nullable: true })
  website?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'int', nullable: true })
  clientRating?: number;

  @Column({ type: 'enum', enum: CANDIDATE_SOURCES, default: 'PORTAL' })
  source!: CandidateSource;

  // Overall pipeline status for this candidate, independent of the per-role
  // stage tracked on each Application — surfaced as the Candidates tab filter.
  @Column({ type: 'enum', enum: GLOBAL_STATUSES, default: 'OPEN' })
  globalStatus!: GlobalStatus;

  // Sub-status within the current globalStatus — its valid values depend on
  // globalStatus (see STATUS_OPTIONS_BY_GLOBAL_STATUS), so this is a plain
  // varchar rather than a DB enum; the service layer enforces the pairing.
  @Column({ type: 'varchar', default: 'LOOKING' })
  status!: CandidateStatus;

  @OneToMany(() => Application, (application) => application.candidate)
  applications!: Application[];

  @OneToMany(() => CandidateFeedback, (feedback) => feedback.candidate, { cascade: true })
  feedback!: CandidateFeedback[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
