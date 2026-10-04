import crypto from 'node:crypto';
import { authenticate, hashPassword, requireAdmin, verifyPassword } from './auth.js';
import { HttpError, requireString, wrap } from './http.js';

const CODE_TTL_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const REQUESTS_PER_HOUR = 10;
// No 0/O/1/I/L so a code read out loud or copied by hand is not misread.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const newCode = () => Array.from({ length: 8 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');

// There is no email service, so the admin office hands out the reset code after checking who is asking.
// Flow: student requests -> admin generates a one-time code -> student sets a new password with it.
export function passwordResetRoutes(db, router) {
  const auth = authenticate(db);
  const askedByIp = new Map(); // ip -> request timestamps in the last hour

  router.post('/auth/forgot', wrap((req, res) => {
    const now = Date.now();
    const recent = (askedByIp.get(req.ip) ?? []).filter((t) => now - t < 3_600_000);
    if (recent.length >= REQUESTS_PER_HOUR) throw new HttpError(429, 'Too many requests. Try again later.');
    askedByIp.set(req.ip, [...recent, now]);

    const email = requireString(req.body?.email, 'Email', { max: 120 }).toLowerCase();
    const user = db.prepare("SELECT id FROM users WHERE email = ? AND role != 'admin'").get(email);
    if (user && !db.prepare('SELECT 1 FROM password_resets WHERE user_id = ? AND used_at IS NULL AND requested_at > ?').get(user.id, now - 3_600_000)) {
      db.prepare('INSERT INTO password_resets (user_id, requested_at) VALUES (?, ?)').run(user.id, now);
    }
    // Same answer whether or not the account exists, so this cannot be used to find out who has one.
    res.json({ ok: true });
  }));

  router.post('/auth/reset', wrap((req, res) => {
    const email = requireString(req.body?.email, 'Email', { max: 120 }).toLowerCase();
    const code = requireString(req.body?.code, 'Code', { max: 20 }).toUpperCase().replace(/[\s-]/g, '');
    const password = requireString(req.body?.password, 'New password', { min: 6, max: 100 });
    const invalid = new HttpError(400, 'That code is invalid or has expired. Ask the admin office for a new one.');

    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    const reset = user && db.prepare(
      'SELECT * FROM password_resets WHERE user_id = ? AND used_at IS NULL AND code_hash IS NOT NULL ORDER BY id DESC LIMIT 1',
    ).get(user.id);
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

  router.get('/admin/resets', auth, requireAdmin, (_req, res) => {
    res.json(db.prepare(
      `SELECT r.id, r.requested_at, r.expires_at, (r.code_hash IS NOT NULL AND r.expires_at > ?) AS code_active, u.name, u.email, u.role
       FROM password_resets r JOIN users u ON u.id = r.user_id
       WHERE r.used_at IS NULL AND r.requested_at > ? ORDER BY r.requested_at DESC`,
    ).all(Date.now(), Date.now() - 24 * 3_600_000));
  });

  router.post('/admin/resets/:id/code', auth, requireAdmin, wrap((req, res) => {
    const reset = db.prepare('SELECT id FROM password_resets WHERE id = ? AND used_at IS NULL').get(Number(req.params.id));
    if (!reset) throw new HttpError(404, 'Reset request not found');
    const code = newCode();
    const { hash, salt } = hashPassword(code);
    const expiresAt = Date.now() + CODE_TTL_MS;
    db.prepare('UPDATE password_resets SET code_hash = ?, salt = ?, expires_at = ?, attempts = 0 WHERE id = ?').run(hash, salt, expiresAt, reset.id);
    // The only time the code exists in plain text. The admin passes it to the student in person.
    res.json({ code, expires_at: expiresAt });
  }));
}
