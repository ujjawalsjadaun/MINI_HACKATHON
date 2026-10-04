import crypto from 'node:crypto';
import { authenticate, hashPassword, requireAdmin, verifyPassword } from './auth.js';
import { HttpError, requireString, wrap } from './http.js';

const CODE_TTL_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const REQUESTS_PER_HOUR = 10;
// No 0/O/1/I/L so a code read out loud or copied by hand is not misread.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const newCode = () => Array.from({ length: 8 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

// There is no email service, so the admin office approves resets after checking who is asking.
// Flow: the user requests (their browser gets a secret request token) -> an admin approves, which opens a
// 30 minute window -> the same browser is told and sets a new password. A one-time code is issued at the
// same time as a fallback for someone who closed the page or switched device.
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
    const requestToken = crypto.randomBytes(24).toString('hex');
    if (user) {
      // One open request per user; asking again hands the newest browser the token.
      const open = db.prepare('SELECT id FROM password_resets WHERE user_id = ? AND used_at IS NULL AND requested_at > ? ORDER BY id DESC LIMIT 1').get(user.id, now - 3_600_000);
      if (open) db.prepare('UPDATE password_resets SET request_hash = ? WHERE id = ?').run(sha256(requestToken), open.id);
      else db.prepare('INSERT INTO password_resets (user_id, requested_at, request_hash) VALUES (?, ?, ?)').run(user.id, now, sha256(requestToken));
    }
    // Same shape whether or not the account exists, so this cannot be used to find out who has one.
    res.json({ ok: true, request_token: requestToken });
  }));

  // Polled by the waiting browser. Unknown tokens look exactly like requests still waiting for approval.
  router.get('/auth/forgot/status', wrap((req, res) => {
    const token = requireString(req.query.token, 'Token', { max: 100 });
    const row = db.prepare('SELECT code_hash, expires_at, used_at FROM password_resets WHERE request_hash = ?').get(sha256(token));
    const approved = row && !row.used_at && row.code_hash && row.expires_at > Date.now();
    res.json({ status: approved ? 'approved' : 'pending' });
  }));

  router.post('/auth/reset', wrap((req, res) => {
    const password = requireString(req.body?.password, 'New password', { min: 6, max: 100 });
    const invalid = new HttpError(400, 'That reset is invalid or has expired. Ask the admin office again.');
    const now = Date.now();
    let reset;

    if (typeof req.body?.token === 'string') {
      // The browser that made the request, after an admin approved it.
      reset = db.prepare('SELECT * FROM password_resets WHERE request_hash = ? AND used_at IS NULL AND code_hash IS NOT NULL').get(sha256(req.body.token));
      if (!reset || reset.expires_at < now) throw invalid;
    } else {
      // Fallback: the one-time code the admin office read out.
      const email = requireString(req.body?.email, 'Email', { max: 120 }).toLowerCase();
      const code = requireString(req.body?.code, 'Code', { max: 20 }).toUpperCase().replace(/[\s-]/g, '');
      const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      reset = user && db.prepare('SELECT * FROM password_resets WHERE user_id = ? AND used_at IS NULL AND code_hash IS NOT NULL ORDER BY id DESC LIMIT 1').get(user.id);
      if (!reset || reset.expires_at < now || reset.attempts >= MAX_ATTEMPTS) throw invalid;
      if (!verifyPassword(code, reset.salt, reset.code_hash)) {
        db.prepare('UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?').run(reset.id);
        throw invalid;
      }
    }

    const { hash, salt } = hashPassword(password);
    db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(hash, salt, reset.user_id);
    db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').run(now, reset.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(reset.user_id); // sign the user out everywhere
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
    // Approving also opens the reset for the waiting browser. The code is the fallback and is only shown now.
    res.json({ code, expires_at: expiresAt });
  }));
}
