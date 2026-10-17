import express from 'express';
import { aiRoutes } from './ai.js';
import { authRoutes } from './auth.js';
import { emergencyRoutes } from './emergency.js';
import { insightRoutes } from './insights.js';
import { issueRoutes } from './issues.js';
import { metaRoutes } from './meta.js';
import { notificationRoutes } from './notifications.js';
import { peopleRoutes } from './people.js';
import { qrRoutes } from './qr.js';

// Every /api route. Each area owns one file; this is the only place that lists them.
export function apiRouter({ uploadDir, assistant, emergencyFile }) {
  const api = express.Router();
  api.use(metaRoutes());
  api.use(authRoutes());
  api.use(qrRoutes());
  api.use(peopleRoutes());
  api.use(notificationRoutes());
  api.use(emergencyRoutes(emergencyFile));
  api.use(aiRoutes(assistant));
  api.use(issueRoutes({ uploadDir }));
  api.use(insightRoutes());
  return api;
}
