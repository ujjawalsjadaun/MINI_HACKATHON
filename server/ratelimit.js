import { HttpError } from './http.js';

// A small in-memory limiter: at most `max` requests per `windowMs` for each client address.
// It is one process's memory, which is right for this single-server site; it resets when the site restarts.
export function rateLimiter({ windowMs, max, error = () => new HttpError(429, 'Too many requests. Please slow down and try again shortly.'), now = Date.now }) {
  const clients = new Map();
  return (req, res, next) => {
    const t = now();
    if (clients.size > 10_000) for (const [ip, e] of clients) if (e.resetAt <= t) clients.delete(ip); // keep memory bounded
    let entry = clients.get(req.ip);
    if (!entry || entry.resetAt <= t) {
      entry = { count: 0, resetAt: t + windowMs };
      clients.set(req.ip, entry);
    }
    entry.count++;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - t) / 1000)));
      return next(error());
    }
    next();
  };
}
