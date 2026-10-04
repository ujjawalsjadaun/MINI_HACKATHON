import { ACTIVE_STATUSES, CATEGORIES } from './config.js';
import { slaOf } from './priority.js';

const DAY = 86_400_000;
const STALE_AFTER_DAYS = 3;
export const RECURRING_MIN = 3;
export const RECURRING_WINDOW_DAYS = 30;

// Aggregates for the admin dashboard: where problems cluster, what keeps coming back,
// and what is stuck.
export function buildInsights(db, now = Date.now()) {
  const all = (sql, ...p) => db.prepare(sql).all(...p);
  const one = (sql, ...p) => db.prepare(sql).get(...p);

  const totals = one(`SELECT
      COUNT(*) AS issues,
      SUM(status != 'resolved') AS active,
      SUM(status = 'resolved') AS resolved,
      (SELECT COUNT(*) FROM reports) AS reports,
      AVG(CASE WHEN resolved_at IS NOT NULL THEN resolved_at - created_at END) AS avg_resolution_ms,
      COALESCE(SUM(reopen_count), 0) AS reopens,
      COALESCE(SUM(reopen_count > 0), 0) AS reopened_issues
    FROM issues`);

  const byStatus = all('SELECT status, COUNT(*) AS count FROM issues GROUP BY status');
  const byCategory = all('SELECT category, COUNT(*) AS count FROM issues GROUP BY category ORDER BY count DESC')
    .map((r) => ({ ...r, label: CATEGORIES[r.category]?.label ?? r.category }));
  const hotspots = all(`SELECT location, COUNT(*) AS issues,
      SUM(status != 'resolved') AS active
    FROM issues GROUP BY location ORDER BY issues DESC, active DESC`);

  // The same kind of problem at the same place, again and again -> a maintenance root cause.
  const recurring = all(`SELECT category, location, COUNT(*) AS occurrences, MAX(created_at) AS last_seen
    FROM issues WHERE created_at >= ? GROUP BY category, location HAVING COUNT(*) >= ?
    ORDER BY occurrences DESC, last_seen DESC`, now - RECURRING_WINDOW_DAYS * DAY, RECURRING_MIN)
    .map((r) => ({ ...r, label: CATEGORIES[r.category]?.label ?? r.category }));

  // Issues past their category deadline, worst first.
  const overdue = all(`SELECT id, title, category, location, status, created_at FROM issues
    WHERE status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})`, ...ACTIVE_STATUSES)
    .map((i) => ({ ...i, sla: slaOf({ category: i.category, createdAt: i.created_at, status: i.status }, now) }))
    .filter((i) => i.sla.overdue)
    .sort((a, b) => b.sla.overdue_hours - a.sla.overdue_hours);

  const resolutionByCategory = all(`SELECT category, COUNT(*) AS resolved, AVG(resolved_at - created_at) AS avg_ms
    FROM issues WHERE resolved_at IS NOT NULL GROUP BY category ORDER BY avg_ms DESC`)
    .map((r) => ({ category: r.category, label: CATEGORIES[r.category]?.label ?? r.category, resolved: r.resolved, avg_hours: Math.round((r.avg_ms / 3_600_000) * 10) / 10 }));

  const stale = all(`SELECT id, title, location, status, created_at FROM issues
    WHERE status != 'resolved' AND created_at < ? ORDER BY created_at LIMIT 10`, now - STALE_AFTER_DAYS * DAY);

  const byDepartment = all(`SELECT department,
      SUM(status != 'resolved') AS active, SUM(status = 'resolved') AS resolved
    FROM issues GROUP BY department ORDER BY active DESC`);

  // How students rated the fixes: overall, per category, and the lowest ratings with their comments (no names).
  const rating = one('SELECT COUNT(*) AS rated, ROUND(AVG(rating), 1) AS average FROM feedback');
  const ratingByCategory = all(`SELECT i.category, COUNT(*) AS count, ROUND(AVG(f.rating), 1) AS average
    FROM feedback f JOIN issues i ON i.id = f.issue_id GROUP BY i.category ORDER BY average ASC, count DESC`)
    .map((r) => ({ ...r, label: CATEGORIES[r.category]?.label ?? r.category }));
  const lowRated = all(`SELECT i.id, i.title, i.location, f.rating, f.comment FROM feedback f JOIN issues i ON i.id = f.issue_id
    WHERE f.rating <= 2 ORDER BY f.updated_at DESC LIMIT 10`);

  return {
    totals: {
      issues: totals.issues,
      active: totals.active ?? 0,
      resolved: totals.resolved ?? 0,
      reports: totals.reports,
      duplicates_merged: totals.reports - totals.issues,
      overdue: overdue.length,
      reopens: totals.reopens,
      reopened_issues: totals.reopened_issues,
      rated: rating.rated,
      avg_rating: rating.average,
      avg_resolution_hours: totals.avg_resolution_ms == null ? null : Math.round((totals.avg_resolution_ms / 3_600_000) * 10) / 10,
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
