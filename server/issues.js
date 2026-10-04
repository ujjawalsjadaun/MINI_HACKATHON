import { ACTIVE_STATUSES, CATEGORIES, LOCATIONS } from './config.js';
import { transaction } from './db.js';
import { MATCH_THRESHOLD, explainMatch, findDuplicate, normalizeRoom, sameRoomOrUnknown, similarity, tokenize } from './dedupe.js';
import { HttpError, requireString } from './http.js';
import { priorityOf } from './priority.js';

const ISSUE_SELECT = `
  SELECT i.*, (SELECT COUNT(*) FROM reports r WHERE r.issue_id = i.id) AS report_count
  FROM issues i`;

function withPriority(row, now = Date.now()) {
  return {
    ...row,
    priority: priorityOf({
      category: row.category,
      description: row.description,
      reportCount: row.report_count,
      createdAt: row.created_at,
      status: row.status,
    }, now),
  };
}

export function validateReportInput(body = {}) {
  const category = requireString(body.category, 'Category', { max: 30 });
  const location = requireString(body.location, 'Location', { max: 60 });
  if (!CATEGORIES[category]) throw new HttpError(400, 'Unknown category');
  if (!LOCATIONS.includes(location)) throw new HttpError(400, 'Unknown location');
  return {
    category,
    location,
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
      db.prepare('INSERT INTO reports (issue_id, user_id, description, photo, match_reason, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(issueId, user.id, input.description, photo, reason, now);
      db.prepare('UPDATE issues SET updated_at = ? WHERE id = ?').run(now, issueId);
      return { issueId, merged: true, reason };
    }

    const title = input.description.length > 60 ? `${input.description.slice(0, 57)}...` : input.description;
    const department = CATEGORIES[input.category].department;
    const info = db
      .prepare(`INSERT INTO issues (title, category, location, detail, description, department, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(title, input.category, input.location, input.detail, input.description, department, now, now);
    const issueId = Number(info.lastInsertRowid);
    db.prepare('INSERT INTO reports (issue_id, user_id, description, photo, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(issueId, user.id, input.description, photo, now);
    db.prepare('INSERT INTO status_log (issue_id, status, note, actor, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(issueId, 'open', `Reported and routed to ${department}`, 'system', now);
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
  });
}

export function listIssues(db, { status, category, location, mineOf } = {}) {
  const where = [];
  const params = [];
  if (status === 'active') where.push("i.status != 'resolved'");
  else if (status) { where.push('i.status = ?'); params.push(status); }
  if (category) { where.push('i.category = ?'); params.push(category); }
  if (location) { where.push('i.location = ?'); params.push(location); }
  if (mineOf) { where.push('EXISTS (SELECT 1 FROM reports r WHERE r.issue_id = i.id AND r.user_id = ?)'); params.push(mineOf); }
  const sql = `${ISSUE_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
  return db.prepare(sql).all(...params).map((row) => withPriority(row))
    .sort((a, b) => b.priority.score - a.priority.score || b.created_at - a.created_at);
}

export function getIssueDetail(db, id, viewer) {
  const row = db.prepare(`${ISSUE_SELECT} WHERE i.id = ?`).get(id);
  if (!row) throw new HttpError(404, 'Issue not found');
  const isAdmin = viewer.role === 'admin';
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
  return { issue: withPriority(row), reports: isAdmin ? reports : reports.filter((r) => r.mine), log };
}
