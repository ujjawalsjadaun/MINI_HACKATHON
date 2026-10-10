import { authenticate } from './auth.js';
import { HttpError, wrap } from './http.js';

// What happened, stored as a kind plus details rather than finished English text, so each person reads it in
// the language they have chosen (the browser turns the kind into a sentence).
export const KINDS = ['acknowledged', 'assigned', 'in_progress', 'needs_confirmation', 'note', 'assigned_you', 'reopened', 'resolved', 'new_emergency'];

const MAX_NOTE = 160;

// Writes one notification to each person, skipping the person who caused it and any account that is switched off.
export function notify(db, userIds, { issueId, kind, params = {}, exceptUserId = null }, now = Date.now()) {
  if (!KINDS.includes(kind)) throw new Error(`Unknown notification kind: ${kind}`);
  const insert = db.prepare('INSERT INTO notifications (user_id, issue_id, kind, params, created_at) VALUES (?, ?, ?, ?, ?)');
  const active = db.prepare('SELECT 1 FROM users WHERE id = ? AND active = 1');
  const body = JSON.stringify(params);
  for (const id of new Set(userIds)) {
    if (id == null || id === exceptUserId || !active.get(id)) continue;
    insert.run(id, issueId, kind, body, now);
  }
}

export const reporterIds = (db, issueId) => db.prepare('SELECT DISTINCT user_id FROM reports WHERE issue_id = ?').all(issueId).map((r) => r.user_id);
export const adminIds = (db) => db.prepare("SELECT id FROM users WHERE role = 'admin' AND active = 1").all().map((r) => r.id);
export const shortNote = (note) => (typeof note === 'string' && note.trim() ? note.trim().slice(0, MAX_NOTE) : undefined);

const view = (row) => ({ id: row.id, issue_id: row.issue_id, kind: row.kind, params: JSON.parse(row.params), created_at: row.created_at, read: row.read_at != null });

export function notificationRoutes(db, router) {
  const auth = authenticate(db);
  const unread = (userId) => db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(userId).n;

  router.get('/notifications', auth, (req, res) => {
    const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50').all(req.user.id);
    res.json({ unread: unread(req.user.id), items: rows.map(view) });
  });

  // Polled by the bell in the menu, so it stays tiny.
  router.get('/notifications/unread-count', auth, (req, res) => res.json({ unread: unread(req.user.id) }));

  // Marks the given ids (or all of them) as read. Only ever the caller's own.
  router.post('/notifications/read', auth, wrap((req, res) => {
    const { ids } = req.body ?? {};
    if (ids !== undefined && (!Array.isArray(ids) || ids.length > 200 || !ids.every(Number.isInteger))) throw new HttpError(400, 'ids must be a list of numbers');
    const now = Date.now();
    if (ids === undefined) {
      db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(now, req.user.id);
    } else {
      const mark = db.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL');
      for (const id of ids) mark.run(now, id, req.user.id);
    }
    res.json({ unread: unread(req.user.id) });
  }));
}
