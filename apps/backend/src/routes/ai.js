import express from 'express';
import { HttpError, requireString, wrap } from '../lib/http.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const LIMIT_PER_MINUTE = 20;

// The optional "Smart suggest" helper on the report form (see services/ai.js).
export function aiRoutes(assistant) {
  const router = express.Router();
  const recent = new Map(); // user id -> request timestamps in the last minute

  router.get('/ai/status', authenticate, (_req, res) => res.json({ enabled: Boolean(assistant), engine: assistant?.engine }));

  router.post('/ai/suggest', authenticate, requireRole('student'), wrap(async (req, res) => {
    if (!assistant) throw new HttpError(503, 'Suggestions are not available on this server');
    const now = Date.now();
    const inWindow = (recent.get(req.user.id) ?? []).filter((t) => now - t < 60_000);
    if (inWindow.length >= LIMIT_PER_MINUTE) throw new HttpError(429, 'Too many requests. Wait a minute and try again.');
    recent.set(req.user.id, [...inWindow, now]);

    const description = requireString(req.body?.description, 'Description', { min: 8, max: 600 });
    const location = typeof req.body?.location === 'string' ? req.body.location.slice(0, 60) : '';
    res.json(await assistant.suggest({ description, location }));
  }));

  return router;
}
