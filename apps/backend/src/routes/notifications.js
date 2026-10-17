import express from 'express';
import { HttpError, wrap } from '../lib/http.js';
import { authenticate } from '../middleware/auth.js';
import { inboxOf, markRead, unreadCount } from '../services/notifications.js';

export function notificationRoutes() {
  const router = express.Router();

  router.get('/notifications', authenticate, wrap(async (req, res) => res.json(await inboxOf(req.user.id))));

  // Polled by the bell in the menu, so it stays tiny.
  router.get('/notifications/unread-count', authenticate, wrap(async (req, res) => res.json({ unread: await unreadCount(req.user.id) })));

  // Marks the given ids (or all of them) as read. Only ever the caller's own.
  router.post('/notifications/read', authenticate, wrap(async (req, res) => {
    const { ids } = req.body ?? {};
    if (ids !== undefined && (!Array.isArray(ids) || ids.length > 200 || !ids.every(Number.isInteger))) throw new HttpError(400, 'ids must be a list of numbers');
    res.json({ unread: await markRead(req.user.id, ids) });
  }));

  return router;
}
