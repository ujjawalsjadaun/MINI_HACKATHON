import { ACTIVE_STATUSES, CATEGORIES, LOCATIONS, URGENCIES } from './config.js';
import { transaction } from './db.js';
import { MATCH_THRESHOLD, explainMatch, findDuplicate, normalizeRoom, sameRoomOrUnknown, similarity, tokenize } from './dedupe.js';
import { HttpError, requireString } from './http.js';
import { feedbackFor } from './feedback.js';
import { adminIds, notify, reporterIds, shortNote } from './notifications.js';
import { priorityOf, slaOf } from './priority.js';

const ISSUE_SELECT = `
  SELECT i.*, (SELECT COUNT(*) FROM reports r WHERE r.issue_id = i.id) AS report_count,
    (SELECT MAX(CASE r.urgency WHEN 'emergency' THEN 2 WHEN 'urgent' THEN 1 ELSE 0 END) FROM reports r WHERE r.issue_id = i.id) AS urgency_level,
    (SELECT COUNT(*) FROM feedback f WHERE f.issue_id = i.id) AS feedback_count,
    (SELECT ROUND(AVG(f.rating), 1) FROM feedback f WHERE f.issue_id = i.id) AS feedback_avg
  FROM issues i`;

const URGENCY_BY_LEVEL = ['normal', 'urgent', 'emergency'];

function withPriority(row, now = Date.now()) {
  return {
    ...row,
    sla: slaOf({ category: row.category, createdAt: row.created_at, status: row.status }, now),
    priority: priorityOf({
      category: row.category,
      description: row.description,
      reportCount: row.report_count,
      createdAt: row.created_at,
      status: row.status,
      reopenCount: row.reopen_count,
      urgency: URGENCY_BY_LEVEL[row.urgency_level ?? 0],
    }, now),
  };
}

export function validateReportInput(body = {}) {
  const category = requireString(body.category, 'Category', { max: 30 });
  const location = requireString(body.location, 'Location', { max: 60 });
  if (!CATEGORIES[category]) throw new HttpError(400, 'Unknown category');
  if (!LOCATIONS.includes(location)) throw new HttpError(400, 'Unknown location');
  // An optional pin dropped on the schematic map, as fractions (0 to 1) of its width and height.
  let pin = null;
  if (body.pin_x !== undefined && body.pin_x !== '' || body.pin_y !== undefined && body.pin_y !== '') {
    const [x, y] = [Number(body.pin_x), Number(body.pin_y)];
    if (![x, y].every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) throw new HttpError(400, 'The map pin must be inside the map');
    pin = { x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 };
  }
  const urgency = body.urgency ?? 'normal';
  if (!URGENCIES[urgency]) throw new HttpError(400, 'Unknown urgency');
  return {
    category,
    location,
    urgency,
    pin,
    detail: typeof body.detail === 'string' ? body.detail.trim().slice(0, 100) : '',
    description: requireString(body.description, 'Description', { min: 8, max: 600 }),
  };
}

// Open issues already reported at this location, most relevant first. Works as soon as a
// location is chosen; category, room and description sharpen the ranking and the "likely" flag.
export function nearbyIssues(db, { location, category = '', detail = '', description = '' }) {
  if (!LOCATIONS.includes(location)) throw new HttpError(400, 'Unknown location');
  const placeholders = ACTIVE_STATUSES.map(() => '?').join(',');
  const rows = db.prepare(`${ISSUE_SELECT} WHERE i.location = ? AND i.status IN (${placeholders})`).all(location, ...ACTIVE_STATUSES);
  const incoming = tokenize(`${description} ${detail}`);
  const reportsOf = db.prepare('SELECT description FROM reports WHERE issue_id = ?');

  return rows
    .filter((row) => sameRoomOrUnknown(row.detail, detail))
    .map((row) => {
      const known = tokenize(`${row.description} ${row.detail}`);
      for (const r of reportsOf.all(row.id)) for (const t of tokenize(r.description)) known.add(t);
      const score = description.trim().length >= 8 ? similarity(incoming, known) : 0;
      const sameCategory = row.category === category;
      const sameRoom = Boolean(detail) && Boolean(row.detail) && normalizeRoom(row.detail) === normalizeRoom(detail);
      return {
        id: row.id,
        title: row.title,
        category: row.category,
        detail: row.detail,
        status: row.status,
        report_count: row.report_count,
        score: Math.round(score * 100),
        likely: sameCategory && (score >= MATCH_THRESHOLD || sameRoom),
        rank: (sameCategory ? 2 : 0) + (sameRoom ? 1 : 0) + score,
      };
    })
    .sort((a, b) => b.rank - a.rank || b.report_count - a.report_count)
    .slice(0, 5)
    .map(({ rank, ...issue }) => issue);
}

// A team claiming a fix is only a claim. New evidence that the problem persists reopens it.
function reopenIfAwaiting(db, issueId, note, now) {
  const issue = db.prepare('SELECT title, status, assigned_to, assigned_user_id FROM issues WHERE id = ?').get(issueId);
  if (issue.status !== 'awaiting_confirmation') return false;
  const next = issue.assigned_to ? 'assigned' : 'open';
  db.prepare('UPDATE issues SET status = ?, reopen_count = reopen_count + 1, resolved_at = NULL, updated_at = ? WHERE id = ?').run(next, now, issueId);
  db.prepare('INSERT INTO status_log (issue_id, status, note, actor, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(issueId, next, `Reopened: ${note}`, 'reporter', now);
  // The person holding the work, and the admins, need to know a claimed fix did not hold.
  notify(db, [issue.assigned_user_id, ...adminIds(db)], { issueId, kind: 'reopened', params: { title: issue.title, note: shortNote(note) } }, now);
  return true;
}

function requireReporterOfAwaitingIssue(db, user, issueId) {
  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(issueId);
  if (!issue) throw new HttpError(404, 'Issue not found');
  if (!db.prepare('SELECT 1 FROM reports WHERE issue_id = ? AND user_id = ?').get(issueId, user.id)) {
    throw new HttpError(403, 'Only students who reported this issue can confirm or reopen it');
  }
  if (issue.status !== 'awaiting_confirmation') throw new HttpError(409, 'This issue is not waiting for confirmation');
}

// Nobody closes a ticket for the reporters: one of them confirms the fix really happened.
export function confirmFix(db, user, issueId, now = Date.now()) {
  return transaction(db, () => {
    requireReporterOfAwaitingIssue(db, user, issueId);
    db.prepare("UPDATE issues SET status = 'resolved', resolved_at = ?, updated_at = ? WHERE id = ?").run(now, now, issueId);
    db.prepare('INSERT INTO status_log (issue_id, status, note, actor, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(issueId, 'resolved', 'Fix confirmed by a reporter', 'reporter', now);
    const issue = db.prepare('SELECT title, assigned_user_id FROM issues WHERE id = ?').get(issueId);
    notify(db, [issue.assigned_user_id, ...reporterIds(db, issueId)], { issueId, kind: 'resolved', params: { title: issue.title }, exceptUserId: user.id }, now);
  });
}

export function rejectFix(db, user, issueId, note = '', now = Date.now()) {
  return transaction(db, () => {
    requireReporterOfAwaitingIssue(db, user, issueId);
    const reason = typeof note === 'string' && note.trim() ? note.trim().slice(0, 300) : 'Reporter says it is not fixed';
    reopenIfAwaiting(db, issueId, reason, now);
  });
}

// A report rated Emergency should not wait for an admin to open the queue.
function alertAdminsIfEmergency(db, issueId, input, now) {
  if (input.urgency !== 'emergency') return;
  const { title } = db.prepare('SELECT title FROM issues WHERE id = ?').get(issueId);
  notify(db, adminIds(db), { issueId, kind: 'new_emergency', params: { title, place: input.location } }, now);
}

// Either merges the report into an existing active issue or opens a new one.
export function submitReport(db, user, input, photo, now = Date.now()) {
  return transaction(db, () => {
    const [best] = findDuplicate(db, input);
    if (best) {
      const issueId = best.issue.id;
      if (db.prepare('SELECT 1 FROM reports WHERE issue_id = ? AND user_id = ?').get(issueId, user.id)) {
        throw new HttpError(409, 'You have already reported this issue');
      }
      const reason = explainMatch(input.category, input.location, best.score);
      db.prepare('INSERT INTO reports (issue_id, user_id, description, photo, match_reason, urgency, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(issueId, user.id, input.description, photo, reason, input.urgency, now);
      db.prepare('UPDATE issues SET updated_at = ?, pin_x = COALESCE(pin_x, ?), pin_y = COALESCE(pin_y, ?) WHERE id = ?').run(now, input.pin?.x ?? null, input.pin?.y ?? null, issueId);
      reopenIfAwaiting(db, issueId, 'A new report came in after the fix was claimed', now);
      alertAdminsIfEmergency(db, issueId, input, now);
      return { issueId, merged: true, reason };
    }

    const title = input.description.length > 60 ? `${input.description.slice(0, 57)}...` : input.description;
    const department = CATEGORIES[input.category].department;
    const info = db
      .prepare(`INSERT INTO issues (title, category, location, detail, description, department, created_at, updated_at, pin_x, pin_y)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(title, input.category, input.location, input.detail, input.description, department, now, now, input.pin?.x ?? null, input.pin?.y ?? null);
    const issueId = Number(info.lastInsertRowid);
    db.prepare('INSERT INTO reports (issue_id, user_id, description, photo, urgency, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(issueId, user.id, input.description, photo, input.urgency, now);
    db.prepare('INSERT INTO status_log (issue_id, status, note, actor, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(issueId, 'open', `Reported and routed to ${department}`, 'system', now);
    alertAdminsIfEmergency(db, issueId, input, now);
    return { issueId, merged: false, reason: null };
  });
}

// "Me too": a one-click report on an existing issue, no new description needed.
export function addMeToo(db, user, issueId, now = Date.now()) {
  return transaction(db, () => {
    const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(issueId);
    if (!issue) throw new HttpError(404, 'Issue not found');
    if (issue.status === 'resolved') throw new HttpError(409, 'This issue is already resolved');
    if (db.prepare('SELECT 1 FROM reports WHERE issue_id = ? AND user_id = ?').get(issueId, user.id)) {
      throw new HttpError(409, 'You have already reported this issue');
    }
    db.prepare('INSERT INTO reports (issue_id, user_id, description, match_reason, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(issueId, user.id, 'Confirmed by another student (me too)', 'Confirmed via me too', now);
    db.prepare('UPDATE issues SET updated_at = ? WHERE id = ?').run(now, issueId);
    reopenIfAwaiting(db, issueId, 'Another student says the problem is still there', now);
  });
}

export function listIssues(db, { status, category, location, mineOf, assignedTo } = {}) {
  const where = [];
  const params = [];
  if (status === 'active') where.push("i.status != 'resolved'");
  else if (status) { where.push('i.status = ?'); params.push(status); }
  if (category) { where.push('i.category = ?'); params.push(category); }
  if (location) { where.push('i.location = ?'); params.push(location); }
  if (assignedTo) { where.push('i.assigned_user_id = ?'); params.push(assignedTo); }
  if (mineOf) { where.push('EXISTS (SELECT 1 FROM reports r WHERE r.issue_id = i.id AND r.user_id = ?)'); params.push(mineOf); }
  const sql = `${ISSUE_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
  // A student's own list also says which fixes they have already rated.
  const myRatings = mineOf ? new Map(db.prepare('SELECT issue_id, rating FROM feedback WHERE user_id = ?').all(mineOf).map((r) => [r.issue_id, r.rating])) : null;
  return db.prepare(sql).all(...params).map((row) => withPriority(myRatings ? { ...row, my_rating: myRatings.get(row.id) ?? null } : row))
    .sort((a, b) => b.priority.score - a.priority.score || b.created_at - a.created_at);
}

export function getIssueDetail(db, id, viewer) {
  const row = db.prepare(`${ISSUE_SELECT} WHERE i.id = ?`).get(id);
  if (!row) throw new HttpError(404, 'Issue not found');
  if (viewer.role === 'staff' && row.assigned_user_id !== viewer.id) throw new HttpError(403, 'This issue is not assigned to you');
  const isAdmin = viewer.role === 'admin';
  const seesAllReports = viewer.role !== 'student';
  const reports = db
    .prepare(`SELECT r.id, r.description, r.photo, r.match_reason, r.created_at, r.user_id, u.name AS reporter
              FROM reports r JOIN users u ON u.id = r.user_id WHERE r.issue_id = ? ORDER BY r.created_at`)
    .all(id)
    .map((r) => ({
      id: r.id,
      description: r.description,
      photo: r.photo,
      match_reason: r.match_reason,
      created_at: r.created_at,
      mine: r.user_id === viewer.id,
      reporter: isAdmin ? r.reporter : undefined,
    }));
  const log = db.prepare('SELECT status, note, actor, created_at FROM status_log WHERE issue_id = ? ORDER BY id').all(id);
  const isReporter = reports.some((r) => r.mine);
  return {
    issue: withPriority(row),
    reports: seesAllReports ? reports : reports.filter((r) => r.mine),
    log,
    can_confirm: row.status === 'awaiting_confirmation' && isReporter,
    can_give_feedback: row.status === 'resolved' && isReporter && viewer.role === 'student',
    feedback: feedbackFor(db, id, viewer),
  };
}
