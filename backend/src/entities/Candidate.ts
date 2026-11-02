import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
  ManyToOne,
} from 'typeorm';
import { CandidateSource, GlobalStatus, CandidateStatus, WorkAuthorization } from '../types';
import { CANDIDATE_SOURCES, GLOBAL_STATUSES, WORK_AUTHORIZATIONS } from './enums';
import { User } from './User';
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

  // Whether the candidate currently holds a job — currentTitle/currentCompany
  // only make sense when this is true, but they stay on the entity regardless
  // so a "No" answer doesn't wipe out previously entered values.
  @Column({ type: 'boolean', nullable: true })
  currentlyWorking?: boolean;

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

  // Stores the on-disk filename under uploads/candidate-photos/ (see
  // upload.middleware.ts), not a public URL — served through the
  // authenticated /candidates/:id/photo route, same as the resume.
  @Column({ nullable: true })
  photoUrl?: string;

  @Column({ nullable: true })
  photoFileName?: string;

  @Column({ nullable: true })
  linkedinUrl?: string;

  @Column({ nullable: true })
  website?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'int', nullable: true })
  clientRating?: number;

  // How many days' notice the candidate must give their current employer.
  @Column({ type: 'int', nullable: true })
  noticePeriod?: number;

  @Column({ type: 'enum', enum: CANDIDATE_SOURCES, default: 'PORTAL' })
  source!: CandidateSource;

  // ---- Extended profile (RC-01..RC-12) --------------------------------------

  @Column({ type: 'numeric', precision: 4, scale: 1, nullable: true })
  yearsExperience?: number;

  /** [{ institution, degree, field, startYear, endYear }] */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  education!: EducationEntry[];

  /** [{ name, issuer, issuedAt, expiresAt }] */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  certifications!: CertificationEntry[];

  /** [{ company, title, startDate, endDate, current }] — most recent first. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  employmentHistory!: EmploymentEntry[];

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  languages!: string[];

  // Compensation is SWFS-internal — stripped from every CLIENT response.
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  currentCtc?: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  expectedCtc?: number;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  ctcCurrency!: string;

  @Column({ type: 'date', nullable: true })
  availableFrom?: string;

  @Column({ type: 'enum', enum: WORK_AUTHORIZATIONS, nullable: true })
  workAuthorization?: WorkAuthorization;

  /** Internal labels for slicing the pool (hotlists, campaigns). Admin-only. */
  @Index()
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  tags!: string[];

  /** The SWFS recruiter responsible for this candidate. */
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  owner?: User | null;

  /** Bumped whenever a call/email/meeting is logged against the candidate. */
  @Column({ type: 'timestamptz', nullable: true })
  lastContactedAt?: Date | null;

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

export interface EducationEntry {
  institution: string;
  degree?: string;
  field?: string;
  startYear?: number;
  endYear?: number;
}

export interface CertificationEntry {
  name: string;
  issuer?: string;
  issuedAt?: string;
  expiresAt?: string;
}

export interface EmploymentEntry {
  company: string;
  title?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
}
