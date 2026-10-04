import crypto from 'node:crypto';
import { hashPassword, verifyPassword } from './auth.js';
import { HttpError, requireString, wrap } from './http.js';

const CODE_TTL_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const REQUESTS_PER_HOUR_PER_IP = 10;
const REQUESTS_PER_HOUR_PER_USER = 3;
// No 0/O/1/I/L so a code typed from an email is not misread.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const newCode = () => Array.from({ length: 8 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');

// Self-service reset: a one-time code is emailed to the address on the account. The code is never returned
// by the API or shown on the page, so only someone who can read that inbox can use it.
export function passwordResetRoutes(db, router, mailer) {
  const askedByIp = new Map(); // ip -> request timestamps in the last hour

  router.post('/auth/forgot', wrap((req, res) => {
    const now = Date.now();
    const recent = (askedByIp.get(req.ip) ?? []).filter((t) => now - t < 3_600_000);
    if (recent.length >= REQUESTS_PER_HOUR_PER_IP) throw new HttpError(429, 'Too many requests. Try again later.');
    askedByIp.set(req.ip, [...recent, now]);

    const email = requireString(req.body?.email, 'Email', { max: 120 }).toLowerCase();
    const user = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(email);
    const asked = user && db.prepare('SELECT COUNT(*) AS n FROM password_resets WHERE user_id = ? AND requested_at > ?').get(user.id, now - 3_600_000).n;

    if (user && asked < REQUESTS_PER_HOUR_PER_USER) {
      const code = newCode();
      const { hash, salt } = hashPassword(code);
      db.prepare('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL').run(now, user.id); // only the newest code works
      db.prepare('INSERT INTO password_resets (user_id, requested_at, code_hash, salt, expires_at) VALUES (?, ?, ?, ?, ?)')
        .run(user.id, now, hash, salt, now + CODE_TTL_MS);
      // Not awaited: the answer must take the same time whether or not the account exists.
      mailer.send({
        to: user.email,
        subject: 'Your CampusFix password reset code',
        text: `Hello ${user.name},\n\nYour CampusFix password reset code is:\n\n    ${code}\n\nIt works once and expires in ${CODE_TTL_MS / 60_000} minutes. If you did not ask for this, ignore this email and your password stays as it is.\n`,
      }).catch((err) => console.error('Could not send the reset email:', err.message));
    }
    // Same answer whether or not the account exists, so this cannot be used to find out who has one.
    res.json({ ok: true, delivery: mailer.delivers ? 'email' : 'console', expires_in: CODE_TTL_MS / 1000 });
  }));

  router.post('/auth/reset', wrap((req, res) => {
    const email = requireString(req.body?.email, 'Email', { max: 120 }).toLowerCase();
    const code = requireString(req.body?.code, 'Code', { max: 20 }).toUpperCase().replace(/[\s-]/g, '');
    const password = requireString(req.body?.password, 'New password', { min: 6, max: 100 });
    const invalid = new HttpError(400, 'That code is invalid or has expired. Request a new one.');

    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    const reset = user && db.prepare('SELECT * FROM password_resets WHERE user_id = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1').get(user.id);
    if (!reset || reset.expires_at < Date.now() || reset.attempts >= MAX_ATTEMPTS) throw invalid;

    if (!verifyPassword(code, reset.salt, reset.code_hash)) {
      db.prepare('UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?').run(reset.id);
      throw invalid;
    }
    const { hash, salt } = hashPassword(password);
    db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(hash, salt, user.id);
    db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').run(Date.now(), reset.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id); // sign the user out everywhere
    res.json({ ok: true });
  }));
}
