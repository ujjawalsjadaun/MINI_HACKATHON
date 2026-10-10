import crypto from 'node:crypto';
import { SECURITY_QUESTIONS } from './config.js';
import { authenticate, createLoginThrottle, hashPassword, normalizeAnswer, requireInstituteEmail, setSecurityQuestion, validateSecurity, verifyPassword } from './auth.js';
import { HttpError, requireString, wrap } from './http.js';
import { MIN_STAFF_PASSWORD } from './users.js';

// A fixed salt and hash to check against when the account cannot be reset this way, so a missing
// account takes about as long to answer as a real one.
const DUMMY = hashPassword('no-such-answer', '00'.repeat(16));

// The same question comes back for the same unknown email every time, so asking twice cannot reveal
// which emails are real.
const decoyQuestion = (email) => SECURITY_QUESTIONS[crypto.createHash('sha256').update(email).digest()[0] % SECURITY_QUESTIONS.length];

// Reset by security question: no email service is needed. Admin accounts are excluded because a guessable
// answer is not enough protection for the most powerful account.
export function securityQuestionRoutes(db, router) {
  // Wrong answers are counted per email (5, so one account cannot be guessed at) and per IP (30, so a shared
  // campus network is not locked out by one person).
  const byEmail = createLoginThrottle();
  const byIp = createLoginThrottle(undefined, 30);
  const auth = authenticate(db);
  const resettable = (email) => db.prepare("SELECT id, security_question, security_hash, security_salt FROM users WHERE email = ? AND role != 'admin' AND active = 1 AND security_hash IS NOT NULL").get(email);

  router.get('/auth/security-question', wrap((req, res) => {
    const email = requireInstituteEmail(req.query.email);
    res.json({ question: resettable(email)?.security_question ?? decoyQuestion(email) });
  }));

  router.post('/auth/reset-password', wrap((req, res) => {
    const email = requireInstituteEmail(req.body?.email);
    const answer = requireString(req.body?.answer, 'Answer', { max: 100 });
    const password = requireString(req.body?.password, 'New password', { min: 6, max: 100 });
    if (byEmail.isLocked(email) || byIp.isLocked(req.ip)) throw new HttpError(429, 'Too many wrong answers. Try again in a few minutes.');

    const user = resettable(email);
    const salt = user?.security_salt ?? DUMMY.salt;
    const expected = user?.security_hash ?? DUMMY.hash;
    if (!verifyPassword(normalizeAnswer(answer), salt, expected) || !user) {
      byEmail.fail(email);
      byIp.fail(req.ip);
      throw new HttpError(400, 'That answer is not correct, or this account cannot be reset this way.');
    }
    byEmail.clear(email);

    const next = hashPassword(password);
    db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(next.hash, next.salt, user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id); // sign the user out everywhere
    res.json({ ok: true });
  }));

  // Anyone can change their own password. The current one is required, wrong guesses are limited (a stolen
  // session must not become a way to guess it), and every other device is signed out.
  const byUser = createLoginThrottle();
  router.put('/me/password', auth, wrap((req, res) => {
    const key = `password:${req.user.id}`;
    if (byUser.isLocked(key)) throw new HttpError(429, 'Too many wrong answers. Try again in a few minutes.');
    const current = requireString(req.body?.current, 'Current password', { max: 100 });
    const row = db.prepare('SELECT password_hash, salt, role FROM users WHERE id = ?').get(req.user.id);
    if (!verifyPassword(current, row.salt, row.password_hash)) {
      byUser.fail(key);
      throw new HttpError(403, 'Your current password is not correct');
    }
    byUser.clear(key);
    const password = requireString(req.body?.password, 'New password', { min: row.role === 'student' ? 6 : MIN_STAFF_PASSWORD, max: 100 });
    if (password === current) throw new HttpError(400, 'Choose a new password that is different from the current one');
    const next = hashPassword(password);
    db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(next.hash, next.salt, req.user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(req.user.id, req.token);
    res.json({ ok: true });
  }));

  // Lets signed-in users (including accounts created before this feature) set or change their question.
  router.put('/me/security-question', auth, wrap((req, res) => {
    const current = requireString(req.body?.password, 'Current password', { max: 100 });
    const row = db.prepare('SELECT password_hash, salt FROM users WHERE id = ?').get(req.user.id);
    if (!verifyPassword(current, row.salt, row.password_hash)) throw new HttpError(403, 'Your current password is not correct');
    const { question, answer } = validateSecurity(req.body?.question, req.body?.answer);
    setSecurityQuestion(db, req.user.id, question, answer);
    res.json({ ok: true });
  }));
}
