import crypto from 'node:crypto';
import { SESSION_TTL_MS } from './config.js';
import { HttpError, requireString, wrap } from './http.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, salt, expectedHex) {
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function createUser(db, { name, email, password, role = 'student', department = null }) {
  const { hash, salt } = hashPassword(password);
  const info = db
    .prepare('INSERT INTO users (name, email, password_hash, salt, role, department, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(name, email, hash, salt, role, department, Date.now());
  return Number(info.lastInsertRowid);
}

function startSession(db, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, Date.now() + SESSION_TTL_MS);
  return token;
}

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, department: u.department });

// Resolves the bearer token into req.user, or rejects with 401.
export function authenticate(db) {
  return (req, _res, next) => {
    const header = req.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return next(new HttpError(401, 'Please sign in'));
    const row = db
      .prepare('SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?')
      .get(token);
    if (!row || row.expires_at < Date.now()) return next(new HttpError(401, 'Session expired, please sign in again'));
    req.user = publicUser(row);
    req.token = token;
    next();
  };
}

export function requireAdmin(req, _res, next) {
  next(req.user?.role === 'admin' ? undefined : new HttpError(403, 'Admin access required'));
}

export const requireRole = (...roles) => (req, _res, next) =>
  next(roles.includes(req.user?.role) ? undefined : new HttpError(403, 'You do not have access to this'));

// Brute-force protection: too many failed logins for one email+IP locks it briefly.
const MAX_FAILURES = 5;
const LOCK_MS = 10 * 60 * 1000;

export function createLoginThrottle(now = () => Date.now()) {
  const failures = new Map();
  const live = (key) => {
    const entry = failures.get(key);
    if (entry && entry.until <= now() && entry.count >= MAX_FAILURES) failures.delete(key);
    return failures.get(key);
  };
  return {
    isLocked: (key) => (live(key)?.count ?? 0) >= MAX_FAILURES,
    fail(key) {
      const entry = live(key) ?? { count: 0 };
      failures.set(key, { count: entry.count + 1, until: now() + LOCK_MS });
    },
    clear: (key) => failures.delete(key),
  };
}

export function authRoutes(db, router, throttle = createLoginThrottle()) {
  router.post('/auth/register', wrap((req, res) => {
    const name = requireString(req.body.name, 'Name', { min: 2, max: 80 });
    const email = requireString(req.body.email, 'Email', { max: 120 }).toLowerCase();
    const password = requireString(req.body.password, 'Password', { min: 6, max: 100 });
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address');
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
      throw new HttpError(409, 'An account with this email already exists');
    }
    const id = createUser(db, { name, email, password });
    res.status(201).json({ token: startSession(db, id), user: { id, name, email, role: 'student' } });
  }));

  router.post('/auth/login', wrap((req, res) => {
    const email = requireString(req.body.email, 'Email', { max: 120 }).toLowerCase();
    const password = requireString(req.body.password, 'Password', { max: 100 });
    const key = `${req.ip}|${email}`;
    if (throttle.isLocked(key)) throw new HttpError(429, 'Too many failed attempts. Try again in a few minutes.');
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !verifyPassword(password, user.salt, user.password_hash)) {
      throttle.fail(key);
      throw new HttpError(401, 'Incorrect email or password');
    }
    throttle.clear(key);
    res.json({ token: startSession(db, user.id), user: publicUser(user) });
  }));

  router.post('/auth/logout', authenticate(db), (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
    res.status(204).end();
  });

  router.get('/me', authenticate(db), (req, res) => res.json(req.user));
}
