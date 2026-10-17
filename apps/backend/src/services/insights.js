import { ACTIVE_STATUSES, CATEGORIES, STATUSES } from '../config/constants.js';
import { Feedback, Issue, Report } from '../models/index.js';
import { slaOf } from './priority.js';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const STALE_AFTER_DAYS = 3;
export const RECURRING_MIN = 3;
export const RECURRING_WINDOW_DAYS = 30;

const round1 = (n) => Math.round(n * 10) / 10;
const labelOf = (category) => CATEGORIES[category]?.label ?? category;
const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);

// Counts how many items fall under each key, as [key, items[]] pairs in first-seen order.
function groupBy(items, keyOf) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

// Aggregates for the admin dashboard: where problems cluster, what keeps coming back, and what is stuck.
// It reads a slim projection of every issue (a few small fields each) and does the arithmetic here, which stays
// quick for a campus-sized dataset and is easy to read and test.
export async function buildInsights(now = Date.now()) {
  const [issues, reportCount, feedback] = await Promise.all([
    Issue.find().select('id title category location department status created_at resolved_at reopen_count -_id').lean(),
    Report.countDocuments(),
    Feedback.find().select('issue_id rating comment updated_at -_id').lean(),
  ]);
  const issueById = new Map(issues.map((i) => [i.id, i]));
  const active = issues.filter((i) => i.status !== 'resolved');
  const resolvedWithTime = issues.filter((i) => i.resolved_at != null);

  const byStatus = [...groupBy(issues, (i) => i.status)].map(([status, items]) => ({ status, count: items.length }))
    .sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status));
  const byCategory = [...groupBy(issues, (i) => i.category)].map(([category, items]) => ({ category, count: items.length, label: labelOf(category) }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
  const hotspots = [...groupBy(issues, (i) => i.location)]
    .map(([location, items]) => ({ location, issues: items.length, active: items.filter((i) => i.status !== 'resolved').length }))
    .sort((a, b) => b.issues - a.issues || b.active - a.active || a.location.localeCompare(b.location));

  // The same kind of problem at the same place, again and again -> a maintenance root cause.
  const since = now - RECURRING_WINDOW_DAYS * DAY;
  const recurring = [...groupBy(issues.filter((i) => i.created_at >= since), (i) => `${i.category}\u0000${i.location}`)]
    .filter(([, items]) => items.length >= RECURRING_MIN)
    .map(([, items]) => ({ category: items[0].category, location: items[0].location, occurrences: items.length, last_seen: Math.max(...items.map((i) => i.created_at)), label: labelOf(items[0].category) }))
    .sort((a, b) => b.occurrences - a.occurrences || b.last_seen - a.last_seen);

  // Issues past their category deadline, worst first.
  const overdue = issues.filter((i) => ACTIVE_STATUSES.includes(i.status))
    .map((i) => ({ id: i.id, title: i.title, category: i.category, location: i.location, status: i.status, created_at: i.created_at, sla: slaOf({ category: i.category, createdAt: i.created_at, status: i.status }, now) }))
    .filter((i) => i.sla.overdue)
    .sort((a, b) => b.sla.overdue_hours - a.sla.overdue_hours);

  const resolutionByCategory = [...groupBy(resolvedWithTime, (i) => i.category)]
    .map(([category, items]) => ({ category, label: labelOf(category), resolved: items.length, avg_ms: mean(items.map((i) => i.resolved_at - i.created_at)) }))
    .sort((a, b) => b.avg_ms - a.avg_ms)
    .map(({ avg_ms, ...row }) => ({ ...row, avg_hours: round1(avg_ms / HOUR) }));

  const stale = active.filter((i) => i.created_at < now - STALE_AFTER_DAYS * DAY).sort((a, b) => a.created_at - b.created_at).slice(0, 10)
    .map((i) => ({ id: i.id, title: i.title, location: i.location, status: i.status, created_at: i.created_at }));

  const byDepartment = [...groupBy(issues, (i) => i.department)]
    .map(([department, items]) => ({ department, active: items.filter((i) => i.status !== 'resolved').length, resolved: items.filter((i) => i.status === 'resolved').length }))
    .sort((a, b) => b.active - a.active || a.department.localeCompare(b.department));

  // How students rated the fixes: overall, per category, and the lowest ratings with their comments (no names).
  const ratingByCategory = [...groupBy(feedback.filter((f) => issueById.has(f.issue_id)), (f) => issueById.get(f.issue_id).category)]
    .map(([category, items]) => ({ category, count: items.length, average: round1(mean(items.map((f) => f.rating))), label: labelOf(category) }))
    .sort((a, b) => a.average - b.average || b.count - a.count);
  const lowRated = feedback.filter((f) => f.rating <= 2 && issueById.has(f.issue_id)).sort((a, b) => b.updated_at - a.updated_at).slice(0, 10)
    .map((f) => ({ id: f.issue_id, title: issueById.get(f.issue_id).title, location: issueById.get(f.issue_id).location, rating: f.rating, comment: f.comment }));

  const reopens = issues.reduce((sum, i) => sum + (i.reopen_count ?? 0), 0);
  const avgResolutionMs = mean(resolvedWithTime.map((i) => i.resolved_at - i.created_at));
  return {
    totals: {
      issues: issues.length,
      active: active.length,
      resolved: issues.length - active.length,
      reports: reportCount,
      duplicates_merged: reportCount - issues.length,
      overdue: overdue.length,
      reopens,
      reopened_issues: issues.filter((i) => i.reopen_count > 0).length,
      rated: feedback.length,
      avg_rating: feedback.length ? round1(mean(feedback.map((f) => f.rating))) : null,
      avg_resolution_hours: avgResolutionMs == null ? null : round1(avgResolutionMs / HOUR),
    },
    by_status: byStatus,
    by_category: byCategory,
    hotspots,
    recurring,
    recurring_rule: { min: RECURRING_MIN, days: RECURRING_WINDOW_DAYS },
    resolution_by_category: resolutionByCategory,
    overdue: overdue.slice(0, 10),
    stale: { after_days: STALE_AFTER_DAYS, issues: stale },
    by_department: byDepartment,
    feedback: { by_category: ratingByCategory, low: lowRated },
  };
}
