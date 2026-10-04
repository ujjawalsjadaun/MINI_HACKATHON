import { HttpError } from './http.js';

const MAX_COMMENT = 300;

// A student who reported (or confirmed with "me too") a problem can rate the fix once it is resolved,
// and can change their rating later. Ratings are 1 (poor) to 5 (excellent) with an optional comment.
export function submitFeedback(db, user, issueId, body = {}, now = Date.now()) {
  const issue = db.prepare('SELECT status FROM issues WHERE id = ?').get(issueId);
  if (!issue) throw new HttpError(404, 'Issue not found');
  if (!db.prepare('SELECT 1 FROM reports WHERE issue_id = ? AND user_id = ?').get(issueId, user.id)) {
    throw new HttpError(403, 'Only students who reported this issue can leave feedback');
  }
  if (issue.status !== 'resolved') throw new HttpError(409, 'Feedback opens once the issue is resolved');

  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, 'Rating must be a whole number from 1 to 5');
  const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, MAX_COMMENT) : '';

  db.prepare(`INSERT INTO feedback (issue_id, user_id, rating, comment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT (issue_id, user_id) DO UPDATE SET rating = excluded.rating, comment = excluded.comment, updated_at = excluded.updated_at`)
    .run(issueId, user.id, rating, comment, now, now);
}

// What each role may see: a student sees the average and their own rating; staff also read every comment
// on their issues but never who wrote it; admins see names too.
export function feedbackFor(db, issueId, viewer) {
  const rows = db.prepare(`SELECT f.user_id, f.rating, f.comment, f.created_at, u.name
                           FROM feedback f JOIN users u ON u.id = f.user_id WHERE f.issue_id = ? ORDER BY f.updated_at`).all(issueId);
  const average = rows.length ? Math.round((rows.reduce((sum, r) => sum + r.rating, 0) / rows.length) * 10) / 10 : null;
  const mine = rows.find((r) => r.user_id === viewer.id);
  const canSeeAll = viewer.role !== 'student';
  return {
    average,
    count: rows.length,
    mine: mine ? { rating: mine.rating, comment: mine.comment } : null,
    entries: canSeeAll
      ? rows.map((r) => ({ rating: r.rating, comment: r.comment, created_at: r.created_at, reporter: viewer.role === 'admin' ? r.name : undefined }))
      : [],
  };
}
