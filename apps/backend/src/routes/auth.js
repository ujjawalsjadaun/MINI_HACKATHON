import express from 'express';
import crypto from 'node:crypto';
import { SECURITY_QUESTIONS } from '../config/constants.js';
import { HttpError, requireString, wrap } from '../lib/http.js';
import { hashPassword, normalizeAnswer, verifyPassword } from '../lib/passwords.js';
import { createLoginThrottle } from '../lib/throttle.js';
import { authenticate } from '../middleware/auth.js';
import { Session, User } from '../models/index.js';
import { createUser, endSessions, publicUser, requireInstituteEmail, setSecurityQuestion, startSession, validateSecurity } from '../services/accounts.js';
import { MIN_STAFF_PASSWORD } from '../services/people.js';

// A fixed salt and hash to check against when the account cannot be reset this way, so a missing
// account takes about as long to answer as a real one.
let dummy;
const dummyHash = async () => (dummy ??= await hashPassword('no-such-answer', '00'.repeat(16)));

// The same question comes back for the same unknown email every time, so asking twice cannot reveal
// which emails are real.
const decoyQuestion = (email) => SECURITY_QUESTIONS[crypto.createHash('sha256').update(email).digest()[0] % SECURITY_QUESTIONS.length];

// Sign-in, registration, password changes and the security-question reset.
export function authRoutes() {
  const router = express.Router();
  const throttle = createLoginThrottle();

  router.post('/auth/register', wrap(async (req, res) => {
    const name = requireString(req.body.name, 'Name', { min: 2, max: 80 });
    const email = requireInstituteEmail(req.body.email);
    const password = requireString(req.body.password, 'Password', { min: 6, max: 100 });
    if (await User.exists({ email })) throw new HttpError(409, 'An account with this email already exists');
    const security = validateSecurity(req.body.securityQuestion, req.body.securityAnswer);
    let id;
    try {
      id = await createUser({ name, email, password, security });
    } catch (err) {
      if (err.code === 11000) throw new HttpError(409, 'An account with this email already exists'); // two sign-ups at once
      throw err;
    }
    res.status(201).json({ token: await startSession(id), user: { id, name, email, role: 'student', security_set: true } });
  }));

  router.post('/auth/login', wrap(async (req, res) => {
    const email = requireInstituteEmail(req.body.email);
    const password = requireString(req.body.password, 'Password', { max: 100 });
    const key = `${req.ip}|${email}`;
    if (throttle.isLocked(key)) throw new HttpError(429, 'Too many failed attempts. Try again in a few minutes.');
    const user = await User.findOne({ email }).lean();
    if (!user || !(await verifyPassword(password, user.salt, user.password_hash))) {
      throttle.fail(key);
      throw new HttpError(401, 'Incorrect email or password');
    }
    if (user.active === false) throw new HttpError(403, 'This account has been deactivated. Contact the administrator.');
    throttle.clear(key);
    res.json({ token: await startSession(user.id), user: publicUser(user) });
  }));

  router.post('/auth/logout', authenticate, wrap(async (req, res) => {
    await Session.deleteOne({ token: req.token });
    res.status(204).end();
  }));

  router.get('/me', authenticate, (req, res) => res.json(req.user));

  // ---- Reset by security question: no email service is needed. Admin accounts are excluded because a guessable
  // answer is not enough protection for the most powerful account.
  // Wrong answers are counted per email (5, so one account cannot be guessed at) and per IP (30, so a shared
  // campus network is not locked out by one person).
  const byEmail = createLoginThrottle();
  const byIp = createLoginThrottle(undefined, 30);
  const resettable = (email) => User.findOne({ email, role: { $ne: 'admin' }, active: true, security_hash: { $ne: null } }).lean();

  router.get('/auth/security-question', wrap(async (req, res) => {
    const email = requireInstituteEmail(req.query.email);
    res.json({ question: (await resettable(email))?.security_question ?? decoyQuestion(email) });
  }));

  router.post('/auth/reset-password', wrap(async (req, res) => {
    const email = requireInstituteEmail(req.body?.email);
    const answer = requireString(req.body?.answer, 'Answer', { max: 100 });
    const password = requireString(req.body?.password, 'New password', { min: 6, max: 100 });
    if (byEmail.isLocked(email) || byIp.isLocked(req.ip)) throw new HttpError(429, 'Too many wrong answers. Try again in a few minutes.');

    const user = await resettable(email);
    const fallback = await dummyHash();
    const salt = user?.security_salt ?? fallback.salt;
    const expected = user?.security_hash ?? fallback.hash;
    if (!(await verifyPassword(normalizeAnswer(answer), salt, expected)) || !user) {
      byEmail.fail(email);
      byIp.fail(req.ip);
      throw new HttpError(400, 'That answer is not correct, or this account cannot be reset this way.');
    }
    byEmail.clear(email);

    const next = await hashPassword(password);
    await User.updateOne({ id: user.id }, { $set: { password_hash: next.hash, salt: next.salt } });
    await endSessions(user.id); // sign the user out everywhere
    res.json({ ok: true });
  }));

  // Anyone can change their own password. The current one is required, wrong guesses are limited (a stolen
  // session must not become a way to guess it), and every other device is signed out.
  const byUser = createLoginThrottle();
  router.put('/me/password', authenticate, wrap(async (req, res) => {
    const key = `password:${req.user.id}`;
    if (byUser.isLocked(key)) throw new HttpError(429, 'Too many wrong answers. Try again in a few minutes.');
    const current = requireString(req.body?.current, 'Current password', { max: 100 });
    const row = await User.findOne({ id: req.user.id }).select('password_hash salt role').lean();
    if (!(await verifyPassword(current, row.salt, row.password_hash))) {
      byUser.fail(key);
      throw new HttpError(403, 'Your current password is not correct');
    }
    byUser.clear(key);
    const password = requireString(req.body?.password, 'New password', { min: row.role === 'student' ? 6 : MIN_STAFF_PASSWORD, max: 100 });
    if (password === current) throw new HttpError(400, 'Choose a new password that is different from the current one');
    const next = await hashPassword(password);
    await User.updateOne({ id: req.user.id }, { $set: { password_hash: next.hash, salt: next.salt } });
    await endSessions(req.user.id, req.token);
    res.json({ ok: true });
  }));

  // Lets signed-in users (including accounts created before this feature) set or change their question.
  router.put('/me/security-question', authenticate, wrap(async (req, res) => {
    const current = requireString(req.body?.password, 'Current password', { max: 100 });
    const row = await User.findOne({ id: req.user.id }).select('password_hash salt').lean();
    if (!(await verifyPassword(current, row.salt, row.password_hash))) throw new HttpError(403, 'Your current password is not correct');
    const { question, answer } = validateSecurity(req.body?.question, req.body?.answer);
    await setSecurityQuestion(req.user.id, question, answer);
    res.json({ ok: true });
  }));

  return router;
}
