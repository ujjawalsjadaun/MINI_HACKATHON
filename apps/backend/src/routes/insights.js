import express from 'express';
import { wrap } from '../lib/http.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { buildInsights } from '../services/insights.js';

export function insightRoutes() {
  const router = express.Router();
  router.get('/insights', authenticate, requireAdmin, wrap(async (_req, res) => res.json(await buildInsights())));
  return router;
}
