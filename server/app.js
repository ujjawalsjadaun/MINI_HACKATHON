import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRoutes } from './auth.js';
import { CATEGORIES, LOCATIONS, STATUSES } from './config.js';
import { HttpError } from './http.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function createApp(db, { uploadDir = path.join(root, 'uploads') } = {}) {
  const app = express();
  const api = express.Router();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(path.join(root, 'public')));
  app.use('/uploads', express.static(uploadDir, { setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff') }));

  api.get('/meta', (_req, res) => {
    res.json({
      categories: Object.entries(CATEGORIES).map(([key, c]) => ({ key, label: c.label, department: c.department })),
      locations: LOCATIONS,
      statuses: STATUSES,
    });
  });
  authRoutes(db, api);

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
