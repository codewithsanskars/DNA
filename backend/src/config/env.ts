import dotenv from 'dotenv';
dotenv.config();

export const env = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  // PostgreSQL — set DATABASE_URL, or the discrete PG* fields below.
  databaseUrl: process.env.DATABASE_URL,
  postgres: {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    database: process.env.PGDATABASE || 'swfs_portal',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    ssl: process.env.PGSSL === 'true',
  },
  jwtSecret: process.env.JWT_SECRET || 'swfs_dev_secret_change_in_prod',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  okta: {
    domain: (process.env.OKTA_DOMAIN || 'https://mock.okta.com').replace(/\/+$/, ''),
    clientId: process.env.OKTA_CLIENT_ID || 'mock_client_id',
    // Optional — leave unset for a public client (an Okta "SPA" app
    // integration, "Client Authentication: None"), which proves itself via
    // PKCE instead of a secret. Set it only for a confidential Web app.
    clientSecret: process.env.OKTA_CLIENT_SECRET || undefined,
    redirectUri: process.env.OKTA_REDIRECT_URI || 'http://localhost:5000/api/auth/okta/callback',
    // The Okta authorization server to use — 'default' (Okta's default custom
    // auth server) unless overridden. Set to 'org' if this app uses the Org
    // Authorization Server instead (no auth-server-id segment in the URLs).
    authServerId: process.env.OKTA_AUTH_SERVER_ID || 'default',
  },
};
