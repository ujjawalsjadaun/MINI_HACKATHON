import crypto from 'node:crypto';
import { EMAIL_DOMAIN, SECURITY_QUESTIONS, SESSION_TTL_MS } from './config.js';
import { HttpError, requireString, wrap } from './http.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// An institute address: something before the @ and exactly @nitap.ac.in after it (any letter case).
export const isInstituteEmail = (email) => EMAIL_RE.test(email) && email.toLowerCase().endsWith(`@${EMAIL_DOMAIN}`);

// Reads the email field, lower-cased, and rejects anything that is not an institute address.
export function requireInstituteEmail(value) {
  const email = requireString(value, 'Email', { max: 120 }).toLowerCase();
  if (!isInstituteEmail(email)) throw new HttpError(400, 'Use your NIT Arunachal Pradesh email address (ending in @nitap.ac.in)');
  return email;
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, salt, expectedHex) {
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// "Rani " and "rani" are the same answer.
export const normalizeAnswer = (answer) => String(answer).toLowerCase().trim().replace(/\s+/g, ' ');

export function validateSecurity(question, answer) {
  if (!SECURITY_QUESTIONS.includes(question)) throw new HttpError(400, 'Choose one of the security questions');
  const cleaned = normalizeAnswer(answer ?? '');
  if (cleaned.length < 3 || cleaned.length > 60) throw new HttpError(400, 'The security answer must be 3 to 60 characters');
  return { question, answer: cleaned };
}

export function setSecurityQuestion(db, userId, question, answer) {
  const { hash, salt } = hashPassword(normalizeAnswer(answer));
  db.prepare('UPDATE users SET security_question = ?, security_hash = ?, security_salt = ? WHERE id = ?').run(question, hash, salt, userId);
}

export function createUser(db, { name, email, password, role = 'student', department = null, security = null }) {
  const { hash, salt } = hashPassword(password);
  const info = db
    .prepare('INSERT INTO users (name, email, password_hash, salt, role, department, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(name, email, hash, salt, role, department, Date.now());
  const id = Number(info.lastInsertRowid);
  if (security) setSecurityQuestion(db, id, security.question, security.answer);
  return id;
}

function startSession(db, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, Date.now() + SESSION_TTL_MS);
  return token;
}

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, department: u.department, security_set: Boolean(u.security_hash) });

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
    if (row.active === 0) return next(new HttpError(401, 'This account has been deactivated'));
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

export function createLoginThrottle(now = () => Date.now(), maxFailures = MAX_FAILURES) {
  const failures = new Map();
  const live = (key) => {
    const entry = failures.get(key);
    if (entry && entry.until <= now() && entry.count >= maxFailures) failures.delete(key);
    return failures.get(key);
  };
  return {
    isLocked: (key) => (live(key)?.count ?? 0) >= maxFailures,
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
    const email = requireInstituteEmail(req.body.email);
    const password = requireString(req.body.password, 'Password', { min: 6, max: 100 });
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
      throw new HttpError(409, 'An account with this email already exists');
    }
    const security = validateSecurity(req.body.securityQuestion, req.body.securityAnswer);
    const id = createUser(db, { name, email, password, security });
    res.status(201).json({ token: startSession(db, id), user: { id, name, email, role: 'student', security_set: true } });
  }));

  router.post('/auth/login', wrap((req, res) => {
    const email = requireInstituteEmail(req.body.email);
    const password = requireString(req.body.password, 'Password', { max: 100 });
    const key = `${req.ip}|${email}`;
    if (throttle.isLocked(key)) throw new HttpError(429, 'Too many failed attempts. Try again in a few minutes.');
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !verifyPassword(password, user.salt, user.password_hash)) {
      throttle.fail(key);
      throw new HttpError(401, 'Incorrect email or password');
    }
    if (user.active === 0) throw new HttpError(403, 'This account has been deactivated. Contact the administrator.');
    throttle.clear(key);
    res.json({ token: startSession(db, user.id), user: publicUser(user) });
  }));

  router.post('/auth/logout', authenticate(db), (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
    res.status(204).end();
  });

  router.get('/me', authenticate(db), (req, res) => res.json(req.user));
}
