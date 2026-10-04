import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aiRoutes, createAssistant } from './ai.js';
import { authenticate, authRoutes, requireAdmin } from './auth.js';
import { buildInsights } from './insights.js';
import { CAMPUS, CATEGORIES, LOCATIONS, STATUSES } from './config.js';
import { HttpError, wrap } from './http.js';
import { INSTITUTE, latestNotices } from './institute.js';
import { issueRoutes } from './issue-routes.js';
import { qrRoutes } from './qr.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function createApp(db, { uploadDir = path.join(root, 'uploads'), assistant = createAssistant() } = {}) {
  const app = express();
  const api = express.Router();
  app.disable('x-powered-by');
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

  api.get('/meta', (_req, res) => {
    res.json({
      categories: Object.entries(CATEGORIES).map(([key, c]) => ({ key, label: c.label, department: c.department })),
      locations: LOCATIONS,
      campus: CAMPUS,
      statuses: STATUSES,
    });
  });
  // Public: shown on the sign-in page. Notices come live from the official site and may be empty.
  api.get('/institute', wrap(async (_req, res) => res.json({ ...INSTITUTE, notices: await latestNotices() })));
  authRoutes(db, api);
  qrRoutes(api);
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
