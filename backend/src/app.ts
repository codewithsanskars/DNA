import 'reflect-metadata';
import path from 'path';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { initializeDatabase } from './config/data-source';
import apiRoutes from './routes';
import { errorHandler, notFound } from './middleware/error.middleware';

const app = express();

// Behind Render's (or any) reverse proxy — needed so req.ip / rate limiting
// see the real client address instead of the proxy's.
app.set('trust proxy', 1);

// Security
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        // blob: for candidate photo previews, https: for organization logos
        // hosted on company sites.
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
      },
    },
  })
);
app.use(
  cors({
    origin: env.frontendUrl,
    credentials: true,
  })
);

// Rate limiting
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: { success: false, error: 'Too many requests' },
  })
);

// Logging
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// API routes
app.use('/api', apiRoutes);

// In a single-service deploy the backend also serves the built React app.
// Skipped when frontend/dist doesn't exist (local dev uses the Vite server).
const FRONTEND_DIST = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  // SPA fallback: any non-API GET gets index.html so client-side routes work on refresh.
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(FRONTEND_DIST, 'index.html')));
}

// Error handling
app.use(notFound);
app.use(errorHandler);

async function start() {
  // The API is backed by Postgres via TypeORM. If the database is
  // unreachable this only logs a warning — every request will then fail
  // once it hits a repository query.
  await initializeDatabase();

  app.listen(env.port, () => {
    console.log(`[Server] Running on http://localhost:${env.port} (${env.nodeEnv})`);
  });
}

start();

export default app;
