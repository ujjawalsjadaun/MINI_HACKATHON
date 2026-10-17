import { STATUSES } from '../config/constants.js';
import { HttpError } from '../lib/http.js';
import { Issue, User } from '../models/index.js';
import { notify, reporterIds, shortNote } from './notifications.js';
import { logStatus } from './status-log.js';

// Admins assign work and may update any issue; staff may only update issues assigned to them.
// Every change is written to the timeline students can see.
export async function updateIssue(actor, issueId, body = {}, now = Date.now()) {
  const issue = await Issue.findOne({ id: issueId }).lean();
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
      const wanted = Number(body.assignee_id);
      const staff = Number.isInteger(wanted) && await User.findOne({ id: wanted, role: 'staff', active: true }).select('id name').lean();
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

  await Issue.updateOne({ id: issueId }, {
    $set: {
      status: nextStatus,
      assigned_to: assignedTo,
      assigned_user_id: assignedUserId,
      updated_at: now,
      resolved_at: nextStatus === 'resolved' ? (issue.resolved_at ?? now) : null,
    },
  });

  const parts = [];
  if (assignedUserId !== issue.assigned_user_id) parts.push(assignedTo ? `Assigned to ${assignedTo}` : 'Unassigned');
  if (note) parts.push(note);
  await logStatus(issueId, nextStatus, parts.join(' - '), actor.name, now);

  // Tell the person given the work, and the reporters about the one thing that matters most in this update.
  const newlyAssigned = assignedUserId !== issue.assigned_user_id && assignedUserId != null;
  if (newlyAssigned) await notify([assignedUserId], { issueId, kind: 'assigned_you', params: { title: issue.title }, exceptUserId: actor.id }, now);
  const changed = nextStatus !== issue.status;
  const params = { title: issue.title };
  let kind;
  if (changed && nextStatus === 'awaiting_confirmation') kind = 'needs_confirmation';
  else if (changed && nextStatus === 'in_progress') kind = 'in_progress';
  else if (newlyAssigned) { kind = 'assigned'; params.name = assignedTo; }
  else if (note) kind = 'note';
  if (kind) {
    if (shortNote(note)) params.note = shortNote(note);
    await notify(await reporterIds(issueId), { issueId, kind, params, exceptUserId: actor.id }, now);
  }
}

// The team tells reporters it has seen the issue, before any work starts.
// Admins can acknowledge any issue; staff only their own. The first acknowledgement stands.
export async function acknowledgeIssue(actor, issueId, now = Date.now()) {
  const issue = await Issue.findOne({ id: issueId }).lean();
  if (!issue) throw new HttpError(404, 'Issue not found');
  if (actor.role === 'staff' && issue.assigned_user_id !== actor.id) {
    throw new HttpError(403, 'This issue is not assigned to you');
  }
  if (issue.status === 'resolved') throw new HttpError(409, 'This issue is already resolved');
  if (issue.acknowledged_at) throw new HttpError(409, `Already acknowledged by ${issue.acknowledged_by}`);

  // Two people clicking at once: only the first update applies.
  const first = await Issue.updateOne({ id: issueId, acknowledged_at: null }, { $set: { acknowledged_at: now, acknowledged_by: actor.name, updated_at: now } });
  if (!first.modifiedCount) {
    const winner = await Issue.findOne({ id: issueId }).select('acknowledged_by -_id').lean();
    throw new HttpError(409, `Already acknowledged by ${winner?.acknowledged_by ?? 'a colleague'}`);
  }
  await logStatus(issueId, issue.status, 'Acknowledged: the team has seen this report', actor.name, now);
  await notify(await reporterIds(issueId), { issueId, kind: 'acknowledged', params: { title: issue.title, name: actor.name }, exceptUserId: actor.id }, now);
}
