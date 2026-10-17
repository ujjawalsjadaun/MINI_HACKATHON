import express from 'express';
import { CAMPUS, CATEGORIES, LOCATIONS, MAP_SIZE, SECURITY_QUESTIONS, STATUSES, URGENCIES } from '../config/constants.js';
import { pingDb } from '../db/connect.js';
import { wrap } from '../lib/http.js';
import { INSTITUTE, latestNotices } from '../services/institute.js';

// Public information the browser needs before anyone signs in.
export function metaRoutes() {
  const router = express.Router();

  // For the host's health check: answers only if the database responds.
  router.get('/health', wrap(async (_req, res) => res.json({ ok: await pingDb() })));

  router.get('/meta', (_req, res) => {
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
  router.get('/institute', wrap(async (_req, res) => res.json({ ...INSTITUTE, notices: await latestNotices() })));

  return router;
}
