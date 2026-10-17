import express from 'express';
import { emergencyFile as defaultEmergencyFile, frontendDist as defaultFrontendDist, isProduction, uploadDir as defaultUploadDir } from './config/env.js';
import { HttpError } from './lib/http.js';
import { rateLimiter } from './lib/ratelimit.js';
import { apiRouter } from './routes/index.js';
import { createAssistant } from './services/ai.js';

// Limits per client address. Generous on purpose: a whole hostel can share one Wi-Fi address. Switched on in
// production (RATE_LIMIT=0 turns them off, RATE_LIMIT=1 on elsewhere) so ordinary development and tests are not throttled.
const defaultRateLimits = () => ((process.env.RATE_LIMIT ?? (isProduction() ? '1' : '0')) === '0' ? null : {
  api: { windowMs: 60_000, max: 1200 },
  register: { windowMs: 3_600_000, max: 40, error: () => new HttpError(429, 'Too many accounts were created from this connection. Try again later.') },
});

// The whole web app as an Express application: security headers, the JSON API under /api, the uploaded photos
// and the built React app. It needs a connected database (see db/connect.js) but is not tied to one.
export function createApp({
  uploadDir = defaultUploadDir(),
  frontendDist = defaultFrontendDist(),
  assistant = createAssistant(),
  emergencyFile = defaultEmergencyFile(),
  rateLimits = defaultRateLimits(),
  logRequests = (process.env.LOG_REQUESTS ?? (isProduction() ? '1' : '0')) !== '0',
  log = console.log,
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Behind a hosting provider's proxy every visitor shares the proxy's address unless it is trusted, which would make
  // the login lock-out apply to everyone at once. Set TRUST_PROXY=1 on such hosts (the number of proxies in front).
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
  app.use((_req, res, next) => {
    if (isProduction()) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains'); // only ever sent over https by a proper host
    res.set({
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
    });
    next();
  });
  // One line per API request: method, path (never the query string, which can hold an email), status, time.
  if (logRequests) {
    app.use('/api', (req, res, next) => {
      const started = process.hrtime.bigint();
      res.on('finish', () => {
        if (req.originalUrl === '/api/health') return;
        log(`${new Date().toISOString()} ${req.ip} ${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${Math.round(Number(process.hrtime.bigint() - started) / 1e6)}ms`);
      });
      next();
    });
  }
  if (rateLimits) {
    app.use('/api', rateLimiter(rateLimits.api));
    app.post('/api/auth/register', rateLimiter(rateLimits.register));
  }
  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(frontendDist));
  app.use('/uploads', express.static(uploadDir, { setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff') }));

  app.use('/api', apiRouter({ uploadDir, assistant, emergencyFile }));
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
