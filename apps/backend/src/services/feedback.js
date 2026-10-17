import { createWithId } from '../db/ids.js';
import { HttpError } from '../lib/http.js';
import { Feedback, Issue, Report, User } from '../models/index.js';

const MAX_COMMENT = 300;

// A student who reported (or confirmed with "me too") a problem can rate the fix once it is resolved,
// and can change their rating later. Ratings are 1 (poor) to 5 (excellent) with an optional comment.
export async function submitFeedback(user, issueId, body = {}, now = Date.now()) {
  const issue = await Issue.findOne({ id: issueId }).select('status').lean();
  if (!issue) throw new HttpError(404, 'Issue not found');
  if (!(await Report.exists({ issue_id: issueId, user_id: user.id }))) {
    throw new HttpError(403, 'Only students who reported this issue can leave feedback');
  }
  if (issue.status !== 'resolved') throw new HttpError(409, 'Feedback opens once the issue is resolved');

  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, 'Rating must be a whole number from 1 to 5');
  const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, MAX_COMMENT) : '';

  const changed = await Feedback.updateOne({ issue_id: issueId, user_id: user.id }, { $set: { rating, comment, updated_at: now } });
  if (!changed.matchedCount) {
    await createWithId(Feedback, { issue_id: issueId, user_id: user.id, rating, comment, created_at: now, updated_at: now });
  }
}

// What each role may see: a student sees the average and their own rating; staff also read every comment
// on their issues but never who wrote it; admins see names too.
export async function feedbackFor(issueId, viewer) {
  const rows = await Feedback.find({ issue_id: issueId }).sort({ updated_at: 1 }).select('-_id').lean();
  const names = viewer.role === 'admin'
    ? new Map((await User.find({ id: { $in: rows.map((r) => r.user_id) } }).select('id name -_id').lean()).map((u) => [u.id, u.name]))
    : new Map();
  const average = rows.length ? Math.round((rows.reduce((sum, r) => sum + r.rating, 0) / rows.length) * 10) / 10 : null;
  const mine = rows.find((r) => r.user_id === viewer.id);
  const canSeeAll = viewer.role !== 'student';
  return {
    average,
    count: rows.length,
    mine: mine ? { rating: mine.rating, comment: mine.comment } : null,
    entries: canSeeAll
      ? rows.map((r) => ({ rating: r.rating, comment: r.comment, created_at: r.created_at, reporter: names.get(r.user_id) }))
      : [],
  };
}
