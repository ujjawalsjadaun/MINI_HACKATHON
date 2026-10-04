import { STATUSES } from './config.js';
import { transaction } from './db.js';
import { HttpError } from './http.js';

// Admin-only: change status and/or assignee. Every change is written to the public timeline.
export function updateIssue(db, admin, issueId, body = {}, now = Date.now()) {
  return transaction(db, () => {
    const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(issueId);
    if (!issue) throw new HttpError(404, 'Issue not found');

    let { status } = body;
    if (status !== undefined && !STATUSES.includes(status)) throw new HttpError(400, 'Unknown status');

    let assignedTo = issue.assigned_to;
    if (body.assigned_to !== undefined) {
      if (typeof body.assigned_to !== 'string' || body.assigned_to.length > 80) throw new HttpError(400, 'Invalid assignee');
      assignedTo = body.assigned_to.trim() || null;
      if (assignedTo && !status && issue.status === 'open') status = 'assigned';
    }
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : '';

    const nextStatus = status ?? issue.status;
    if (nextStatus === issue.status && assignedTo === issue.assigned_to && !note) {
      throw new HttpError(400, 'Nothing to update');
    }

    db.prepare('UPDATE issues SET status = ?, assigned_to = ?, updated_at = ?, resolved_at = ? WHERE id = ?')
      .run(nextStatus, assignedTo, now, nextStatus === 'resolved' ? (issue.resolved_at ?? now) : null, issueId);

    const parts = [];
    if (assignedTo !== issue.assigned_to) parts.push(assignedTo ? `Assigned to ${assignedTo}` : 'Unassigned');
    if (note) parts.push(note);
    db.prepare('INSERT INTO status_log (issue_id, status, note, actor, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(issueId, nextStatus, parts.join(' - '), admin.name, now);
  });
}
