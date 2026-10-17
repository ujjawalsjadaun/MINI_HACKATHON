import { createWithId } from '../db/ids.js';
import { Notification, Report, User } from '../models/index.js';

// What happened, stored as a kind plus details rather than finished English text, so each person reads it in
// the language they have chosen (the browser turns the kind into a sentence).
export const KINDS = ['acknowledged', 'assigned', 'in_progress', 'needs_confirmation', 'note', 'assigned_you', 'reopened', 'resolved', 'new_emergency'];

const MAX_NOTE = 160;

// Writes one notification to each person, skipping the person who caused it and any account that is switched off.
export async function notify(userIds, { issueId, kind, params = {}, exceptUserId = null }, now = Date.now()) {
  if (!KINDS.includes(kind)) throw new Error(`Unknown notification kind: ${kind}`);
  const wanted = [...new Set(userIds)].filter((id) => id != null && id !== exceptUserId);
  if (!wanted.length) return;
  const active = new Set((await User.find({ id: { $in: wanted }, active: true }).select('id -_id').lean()).map((u) => u.id));
  for (const id of wanted) {
    if (active.has(id)) await createWithId(Notification, { user_id: id, issue_id: issueId, kind, params, created_at: now, read_at: null });
  }
}

export const reporterIds = (issueId) => Report.distinct('user_id', { issue_id: issueId });
export const adminIds = () => User.distinct('id', { role: 'admin', active: true });
export const shortNote = (note) => (typeof note === 'string' && note.trim() ? note.trim().slice(0, MAX_NOTE) : undefined);

// Notifications older than this many days are no longer useful and are removed.
export async function purgeOldNotifications(days = 90, now = Date.now()) {
  return (await Notification.deleteMany({ created_at: { $lt: now - days * 86_400_000 } })).deletedCount;
}

const view = (n) => ({ id: n.id, issue_id: n.issue_id, kind: n.kind, params: n.params ?? {}, created_at: n.created_at, read: n.read_at != null });

export const unreadCount = (userId) => Notification.countDocuments({ user_id: userId, read_at: null });

export async function inboxOf(userId) {
  const rows = await Notification.find({ user_id: userId }).sort({ created_at: -1, id: -1 }).limit(50).select('-_id').lean();
  return { unread: await unreadCount(userId), items: rows.map(view) };
}

// Marks the given ids (or every one) as read. Only ever the caller's own.
export async function markRead(userId, ids, now = Date.now()) {
  const filter = { user_id: userId, read_at: null, ...(ids !== undefined && { id: { $in: ids } }) };
  await Notification.updateMany(filter, { $set: { read_at: now } });
  return unreadCount(userId);
}
