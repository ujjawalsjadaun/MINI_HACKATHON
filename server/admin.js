import { STATUSES } from './config.js';
import { transaction } from './db.js';
import { HttpError } from './http.js';

// Admins assign work and may update any issue; staff may only update issues assigned to them.
// Every change is written to the timeline students can see.
export function updateIssue(db, actor, issueId, body = {}, now = Date.now()) {
  return transaction(db, () => {
    const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(issueId);
    if (!issue) throw new HttpError(404, 'Issue not found');
    if (actor.role === 'staff' && issue.assigned_user_id !== actor.id) {
      throw new HttpError(403, 'This issue is not assigned to you');
    }

    let { status } = body;
    if (status !== undefined && !STATUSES.includes(status)) throw new HttpError(400, 'Unknown status');
    if (status === 'resolved' && issue.status !== 'resolved') {
      throw new HttpError(400, 'Only a reporter can confirm a fix. Mark it as awaiting confirmation instead.');
    }

    let assignedTo = issue.assigned_to;
    let assignedUserId = issue.assigned_user_id;
    if (body.assignee_id !== undefined) {
      if (actor.role !== 'admin') throw new HttpError(403, 'Only admins can assign issues');
      if (body.assignee_id === null) {
        assignedTo = null;
        assignedUserId = null;
        if (!status && issue.status === 'assigned') status = 'open';
      } else {
        const staff = db.prepare("SELECT id, name FROM users WHERE id = ? AND role = 'staff'").get(Number(body.assignee_id));
        if (!staff) throw new HttpError(400, 'Unknown staff member');
        assignedTo = staff.name;
        assignedUserId = staff.id;
        if (!status && issue.status === 'open') status = 'assigned';
      }
    }
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : '';

    const nextStatus = status ?? issue.status;
    if (nextStatus === issue.status && assignedUserId === issue.assigned_user_id && !note) {
      throw new HttpError(400, 'Nothing to update');
    }

    db.prepare('UPDATE issues SET status = ?, assigned_to = ?, assigned_user_id = ?, updated_at = ?, resolved_at = ? WHERE id = ?')
      .run(nextStatus, assignedTo, assignedUserId, now, nextStatus === 'resolved' ? (issue.resolved_at ?? now) : null, issueId);

    const parts = [];
    if (assignedUserId !== issue.assigned_user_id) parts.push(assignedTo ? `Assigned to ${assignedTo}` : 'Unassigned');
    if (note) parts.push(note);
    db.prepare('INSERT INTO status_log (issue_id, status, note, actor, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(issueId, nextStatus, parts.join(' - '), actor.name, now);
  });
}

// The team tells reporters it has seen the issue, before any work starts.
// Admins can acknowledge any issue; staff only their own. The first acknowledgement stands.
export function acknowledgeIssue(db, actor, issueId, now = Date.now()) {
  return transaction(db, () => {
    const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(issueId);
    if (!issue) throw new HttpError(404, 'Issue not found');
    if (actor.role === 'staff' && issue.assigned_user_id !== actor.id) {
      throw new HttpError(403, 'This issue is not assigned to you');
    }
    if (issue.status === 'resolved') throw new HttpError(409, 'This issue is already resolved');
    if (issue.acknowledged_at) throw new HttpError(409, `Already acknowledged by ${issue.acknowledged_by}`);

    db.prepare('UPDATE issues SET acknowledged_at = ?, acknowledged_by = ?, updated_at = ? WHERE id = ?')
      .run(now, actor.name, now, issueId);
    db.prepare('INSERT INTO status_log (issue_id, status, note, actor, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(issueId, issue.status, 'Acknowledged: the team has seen this report', actor.name, now);
  });
}
