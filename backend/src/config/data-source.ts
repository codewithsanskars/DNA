import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { env } from './env';
import {
  Organization,
  OrganizationContact,
  User,
  OrganizationMembership,
  Job,
  Candidate,
  Application,
  CandidateFeedback,
  InterviewFeedback,
  AuditLog,
} from '../entities';

const entities = [
  Organization,
  OrganizationContact,
  User,
  OrganizationMembership,
  Job,
  Candidate,
  Application,
  CandidateFeedback,
  InterviewFeedback,
  AuditLog,
];

const shared = {
  entities,
  migrations: ['src/migrations/*.ts'],
  // Template default: auto-create the schema from entities in dev.
  // Switch to migrations (`synchronize: false`) before production.
  synchronize: env.nodeEnv !== 'production',
  logging: env.nodeEnv === 'development',
};

const ssl = env.postgres.ssl ? { rejectUnauthorized: false } : undefined;

export const AppDataSource = new DataSource(
  env.databaseUrl
    ? { type: 'postgres', url: env.databaseUrl, ssl, ...shared }
    : {
        type: 'postgres',
        host: env.postgres.host,
        port: env.postgres.port,
        database: env.postgres.database,
        username: env.postgres.user,
        password: env.postgres.password,
        ssl,
        ...shared,
      }
);

let ready = false;

/**
 * Connect to Postgres. Safe to call more than once.
 *
 * Every repository reads/writes through `AppDataSource.getRepository(Entity)`.
 * If Postgres is unreachable this warns and continues rather than crashing on
 * boot, but requests will fail once they hit a query.
 */
export async function initializeDatabase(): Promise<DataSource | null> {
  if (ready) return AppDataSource;
  try {
    await AppDataSource.initialize();
    ready = true;
    console.log('[DB] PostgreSQL connected via TypeORM');
    return AppDataSource;
  } catch (err) {
    console.warn('[DB] PostgreSQL unavailable — continuing on in-memory data');
    console.warn(`     ${(err as Error).message}`);
    return null;
  }
}

export async function closeDatabase(): Promise<void> {
  if (ready) {
    await AppDataSource.destroy();
    ready = false;
  }
}
