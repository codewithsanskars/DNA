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
  // AI — if OPENAI_API_KEY is set, OpenAI is used; otherwise a local Ollama.
  ai: {
    openaiApiKey: process.env.OPENAI_API_KEY?.trim() || undefined,
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    openaiBaseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    ollamaUrl: (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/+$/, ''),
    ollamaModel: process.env.OLLAMA_MODEL || 'llama3.1',
    // Ollama's default context (2–4k tokens) silently truncates résumés/JDs.
    ollamaNumCtx: parseInt(process.env.OLLAMA_NUM_CTX || '8192', 10),
    timeoutMs: parseInt(process.env.AI_TIMEOUT_MS || '120000', 10),
  },
  // Daily recruiter digest: an in-app notification to each SWFS staff member.
  digest: {
    enabled: process.env.DIGEST_ENABLED !== 'false',
    hour: Math.min(23, Math.max(0, parseInt(process.env.DIGEST_HOUR || '8', 10))),
    weekends: process.env.DIGEST_WEEKENDS === 'true',
  },
  jwtSecret: process.env.JWT_SECRET || 'swfs_dev_secret_change_in_prod',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // Trailing slash stripped: redirects append paths like `/auth/callback`,
  // and a `//auth/callback` URL doesn't match the frontend's route.
  frontendUrl: (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, ''),
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
