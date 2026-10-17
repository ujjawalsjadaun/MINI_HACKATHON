import { ACTIVE_STATUSES, CATEGORIES, LOCATIONS, URGENCIES } from '../config/constants.js';
import { createWithId, NO_MONGO_ID } from '../db/ids.js';
import { HttpError, requireString } from '../lib/http.js';
import { Feedback, Issue, Report, StatusLog, User } from '../models/index.js';
import { MATCH_THRESHOLD, explainMatch, findDuplicate, normalizeRoom, reportTextsOf, sameRoomOrUnknown, similarity, tokenize } from './dedupe.js';
import { feedbackFor } from './feedback.js';
import { adminIds, notify, reporterIds, shortNote } from './notifications.js';
import { priorityOf, slaOf } from './priority.js';
import { logStatus } from './status-log.js';

const URGENCY_BY_LEVEL = Object.keys(URGENCIES); // ['normal', 'urgent', 'emergency'], in level order

// Issues plus the numbers shown on every card: how many students reported each, the highest urgency anyone gave
// it, and how its fix was rated. Only the few small fields needed are read (two numbers per report), and the
// counting is done here with plain queries that every MongoDB-compatible server answers the same way.
async function withCounts(issues) {
  const ids = issues.map((i) => i.id);
  const [reports, feedback] = ids.length
    ? await Promise.all([
      Report.find({ issue_id: { $in: ids } }).select('issue_id urgency_level -_id').lean(),
      Feedback.find({ issue_id: { $in: ids } }).select('issue_id rating -_id').lean(),
    ])
    : [[], []];
  const reportsOf = new Map();
  for (const r of reports) {
    const seen = reportsOf.get(r.issue_id) ?? { count: 0, urgency: 0 };
    reportsOf.set(r.issue_id, { count: seen.count + 1, urgency: Math.max(seen.urgency, r.urgency_level ?? 0) });
  }
  const ratingsOf = new Map();
  for (const f of feedback) ratingsOf.set(f.issue_id, [...(ratingsOf.get(f.issue_id) ?? []), f.rating]);
  return issues.map((issue) => {
    const ratings = ratingsOf.get(issue.id);
    return {
      ...issue,
      report_count: reportsOf.get(issue.id)?.count ?? 0,
      urgency_level: reportsOf.get(issue.id)?.urgency ?? 0,
      feedback_count: ratings?.length ?? 0,
      feedback_avg: ratings ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
    };
  });
}

const findIssues = async (filter) => withCounts(await Issue.find(filter).select(NO_MONGO_ID).lean());

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
export async function nearbyIssues({ location, category = '', detail = '', description = '' }) {
  if (!LOCATIONS.includes(location)) throw new HttpError(400, 'Unknown location');
  const rows = (await findIssues({ location, status: { $in: ACTIVE_STATUSES } }))
    .filter((row) => sameRoomOrUnknown(row.detail, detail));
  const incoming = tokenize(`${description} ${detail}`);
  const reportTexts = await reportTextsOf(rows.map((r) => r.id));

  return rows
    .map((row) => {
      const known = tokenize(`${row.description} ${row.detail}`);
      for (const text of reportTexts.get(row.id) ?? []) for (const t of tokenize(text)) known.add(t);
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
async function reopenIfAwaiting(issueId, note, now) {
  const issue = await Issue.findOne({ id: issueId }).lean();
  if (issue.status !== 'awaiting_confirmation') return false;
  const next = issue.assigned_to ? 'assigned' : 'open';
  // Only one of two simultaneous reopenings counts: the update applies while the issue still awaits confirmation.
  const changed = await Issue.updateOne(
    { id: issueId, status: 'awaiting_confirmation' },
    { $set: { status: next, resolved_at: null, updated_at: now }, $inc: { reopen_count: 1 } },
  );
  if (!changed.modifiedCount) return false;
  await logStatus(issueId, next, `Reopened: ${note}`, 'reporter', now);
  // The person holding the work, and the admins, need to know a claimed fix did not hold.
  await notify([issue.assigned_user_id, ...(await adminIds())], { issueId, kind: 'reopened', params: { title: issue.title, note: shortNote(note) } }, now);
  return true;
}

async function requireReporterOfAwaitingIssue(user, issueId) {
  const issue = await Issue.findOne({ id: issueId }).lean();
  if (!issue) throw new HttpError(404, 'Issue not found');
  if (!(await Report.exists({ issue_id: issueId, user_id: user.id }))) {
    throw new HttpError(403, 'Only students who reported this issue can confirm or reopen it');
  }
  if (issue.status !== 'awaiting_confirmation') throw new HttpError(409, 'This issue is not waiting for confirmation');
}

// Nobody closes a ticket for the reporters: one of them confirms the fix really happened.
export async function confirmFix(user, issueId, now = Date.now()) {
  await requireReporterOfAwaitingIssue(user, issueId);
  const closed = await Issue.findOneAndUpdate(
    { id: issueId, status: 'awaiting_confirmation' },
    { $set: { status: 'resolved', resolved_at: now, updated_at: now } },
    { new: true },
  ).lean();
  if (!closed) throw new HttpError(409, 'This issue is not waiting for confirmation');
  await logStatus(issueId, 'resolved', 'Fix confirmed by a reporter', 'reporter', now);
  await notify([closed.assigned_user_id, ...(await reporterIds(issueId))], { issueId, kind: 'resolved', params: { title: closed.title }, exceptUserId: user.id }, now);
}

export async function rejectFix(user, issueId, note = '', now = Date.now()) {
  await requireReporterOfAwaitingIssue(user, issueId);
  const reason = typeof note === 'string' && note.trim() ? note.trim().slice(0, 300) : 'Reporter says it is not fixed';
  await reopenIfAwaiting(issueId, reason, now);
}

// A report rated Emergency should not wait for an admin to open the queue.
async function alertAdminsIfEmergency(issueId, input, now) {
  if (input.urgency !== 'emergency') return;
  const { title } = await Issue.findOne({ id: issueId }).select('title').lean();
  await notify(await adminIds(), { issueId, kind: 'new_emergency', params: { title, place: input.location } }, now);
}

// One report row. The unique index (issue, student) is what really stops a double report, even for two
// requests that arrive at the same moment.
async function addReport(data) {
  if (await Report.exists({ issue_id: data.issue_id, user_id: data.user_id })) throw new HttpError(409, 'You have already reported this issue');
  try {
    return await createWithId(Report, { ...data, urgency_level: URGENCIES[data.urgency ?? 'normal'].level });
  } catch (err) {
    if (err.code === 11000) throw new HttpError(409, 'You have already reported this issue');
    throw err;
  }
}

// Either merges the report into an existing active issue or opens a new one.
export async function submitReport(user, input, photo, now = Date.now()) {
  const [best] = await findDuplicate(input);
  if (best) {
    const issueId = best.issue.id;
    const reason = explainMatch(input.category, input.location, best.score);
    await addReport({ issue_id: issueId, user_id: user.id, description: input.description, photo, match_reason: reason, urgency: input.urgency, created_at: now });
    await Issue.updateOne({ id: issueId }, { $set: { updated_at: now } });
    // The first pin dropped on an issue stays; a later report only adds one if there is none yet.
    if (input.pin) await Issue.updateOne({ id: issueId, pin_x: null }, { $set: { pin_x: input.pin.x, pin_y: input.pin.y } });
    await reopenIfAwaiting(issueId, 'A new report came in after the fix was claimed', now);
    await alertAdminsIfEmergency(issueId, input, now);
    return { issueId, merged: true, reason };
  }

  const title = input.description.length > 60 ? `${input.description.slice(0, 57)}...` : input.description;
  const department = CATEGORIES[input.category].department;
  const { id: issueId } = await createWithId(Issue, {
    title, category: input.category, location: input.location, detail: input.detail, description: input.description, department,
    created_at: now, updated_at: now, pin_x: input.pin?.x ?? null, pin_y: input.pin?.y ?? null,
  });
  await addReport({ issue_id: issueId, user_id: user.id, description: input.description, photo, urgency: input.urgency, created_at: now });
  await logStatus(issueId, 'open', `Reported and routed to ${department}`, 'system', now);
  await alertAdminsIfEmergency(issueId, input, now);
  return { issueId, merged: false, reason: null };
}

// "Me too": a one-click report on an existing issue, no new description needed.
export async function addMeToo(user, issueId, now = Date.now()) {
  const issue = await Issue.findOne({ id: issueId }).lean();
  if (!issue) throw new HttpError(404, 'Issue not found');
  if (issue.status === 'resolved') throw new HttpError(409, 'This issue is already resolved');
  await addReport({ issue_id: issueId, user_id: user.id, description: 'Confirmed by another student (me too)', match_reason: 'Confirmed via me too', created_at: now });
  await Issue.updateOne({ id: issueId }, { $set: { updated_at: now } });
  await reopenIfAwaiting(issueId, 'Another student says the problem is still there', now);
}

export async function listIssues({ status, category, location, mineOf, assignedTo } = {}) {
  const filter = {};
  if (status === 'active') filter.status = { $ne: 'resolved' };
  else if (status) filter.status = String(status);
  if (category) filter.category = String(category);
  if (location) filter.location = String(location);
  if (assignedTo) filter.assigned_user_id = assignedTo;
  if (mineOf) filter.id = { $in: await Report.distinct('issue_id', { user_id: mineOf }) };

  // A student's own list also says which fixes they have already rated.
  const myRatings = mineOf ? new Map((await Feedback.find({ user_id: mineOf }).select('issue_id rating -_id').lean()).map((r) => [r.issue_id, r.rating])) : null;
  return (await findIssues(filter))
    .map((row) => withPriority(myRatings ? { ...row, my_rating: myRatings.get(row.id) ?? null } : row))
    .sort((a, b) => b.priority.score - a.priority.score || b.created_at - a.created_at);
}

export async function getIssueDetail(id, viewer) {
  const [row] = await findIssues({ id });
  if (!row) throw new HttpError(404, 'Issue not found');
  if (viewer.role === 'staff' && row.assigned_user_id !== viewer.id) throw new HttpError(403, 'This issue is not assigned to you');
  const isAdmin = viewer.role === 'admin';
  const seesAllReports = viewer.role !== 'student';

  const rows = await Report.find({ issue_id: id }).sort({ created_at: 1, id: 1 }).select(NO_MONGO_ID).lean();
  const names = isAdmin
    ? new Map((await User.find({ id: { $in: rows.map((r) => r.user_id) } }).select('id name -_id').lean()).map((u) => [u.id, u.name]))
    : new Map();
  const reports = rows.map((r) => ({
    id: r.id,
    description: r.description,
    photo: r.photo,
    match_reason: r.match_reason,
    created_at: r.created_at,
    mine: r.user_id === viewer.id,
    reporter: names.get(r.user_id),
  }));
  const log = await StatusLog.find({ issue_id: id }).sort({ id: 1 }).select('status note actor created_at -_id').lean();
  const isReporter = reports.some((r) => r.mine);
  return {
    issue: withPriority(row),
    reports: seesAllReports ? reports : reports.filter((r) => r.mine),
    log,
    can_confirm: row.status === 'awaiting_confirmation' && isReporter,
    can_give_feedback: row.status === 'resolved' && isReporter && viewer.role === 'student',
    feedback: await feedbackFor(id, viewer),
  };
}
