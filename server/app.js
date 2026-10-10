import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aiRoutes, createAssistant } from './ai.js';
import { authenticate, authRoutes, requireAdmin } from './auth.js';
import { buildInsights } from './insights.js';
import { CAMPUS, CATEGORIES, LOCATIONS, MAP_SIZE, SECURITY_QUESTIONS, STATUSES, URGENCIES } from './config.js';
import { HttpError, wrap } from './http.js';
import { emergencyRoutes } from './emergency.js';
import { INSTITUTE, latestNotices } from './institute.js';
import { issueRoutes } from './issue-routes.js';
import { securityQuestionRoutes } from './security-question.js';
import { qrRoutes } from './qr.js';
import { userRoutes } from './users.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function createApp(db, { uploadDir = process.env.UPLOAD_DIR || path.join(root, 'uploads'), assistant = createAssistant(), emergencyFile = process.env.EMERGENCY_FILE || path.join(root, 'private', 'emergency-contacts.json') } = {}) {
  const app = express();
  const api = express.Router();
  app.disable('x-powered-by');
  // Behind a hosting provider's proxy every visitor shares the proxy's address unless it is trusted, which would make
  // the login lock-out apply to everyone at once. Set TRUST_PROXY=1 on such hosts (the number of proxies in front).
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
  app.use((_req, res, next) => {
    res.set({
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
    });
    next();
  });
  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(path.join(root, 'public')));
  app.use('/uploads', express.static(uploadDir, { setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff') }));

  // For the host's health check: answers only if the database responds.
  api.get('/health', (_req, res) => res.json({ ok: Boolean(db.prepare('SELECT 1 AS ok').get().ok) }));
  api.get('/meta', (_req, res) => {
    res.json({
      categories: Object.entries(CATEGORIES).map(([key, c]) => ({ key, label: c.label, department: c.department })),
      locations: LOCATIONS,
      campus: CAMPUS,
      mapSize: MAP_SIZE,
      statuses: STATUSES,
      securityQuestions: SECURITY_QUESTIONS,
      urgencies: Object.entries(URGENCIES).map(([key, u]) => ({ key, points: u.points })),
    });
  });
  // Public: shown on the sign-in page. Notices come live from the official site and may be empty.
  api.get('/institute', wrap(async (_req, res) => res.json({ ...INSTITUTE, notices: await latestNotices() })));
  authRoutes(db, api);
  securityQuestionRoutes(db, api);
  qrRoutes(db, api);
  userRoutes(db, api, requireAdmin);
  emergencyRoutes(db, api, emergencyFile);
  aiRoutes(db, api, assistant);
  issueRoutes(db, api, { uploadDir });
  api.get('/insights', authenticate(db), requireAdmin, (_req, res) => res.json(buildInsights(db)));

  app.use('/api', api);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof SyntaxError && err.status === 400) return res.status(400).json({ error: 'Invalid JSON body' });
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on our side' });
  });
  return app;
}
