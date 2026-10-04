import { CATEGORIES } from './config.js';

const HOUR = 3_600_000;
const URGENT_WORDS = /\b(spark|sparks|sparking|short.?circuit|shock|fire|smoke|flood|flooding|burst|exposed|wire|sewage|overflow|injur|danger|unsafe|collapse)/i;

// The clock runs while the team still has work to do. It pauses once a fix is claimed
// (waiting on the reporter) and stops when resolved.
const CLOCK_RUNNING = new Set(['open', 'assigned', 'in_progress']);

export function slaOf({ category, createdAt, status }, now = Date.now()) {
  const hours = CATEGORIES[category]?.slaHours ?? 168;
  const dueAt = createdAt + hours * HOUR;
  const overdue = CLOCK_RUNNING.has(status) && now > dueAt;
  return { hours, due_at: dueAt, overdue, overdue_hours: overdue ? Math.floor((now - dueAt) / HOUR) : 0 };
}

// Priority is computed from live data so it escalates as reports pile up and time passes.
export function priorityOf({ category, description, reportCount, createdAt, status, reopenCount = 0 }, now = Date.now()) {
  const reasons = [];
  let score = (CATEGORIES[category]?.severity ?? 1) * 10;
  reasons.push(`category severity +${score}`);

  const dupBoost = Math.min(30, Math.round(Math.log2(reportCount + 1) * 12));
  if (reportCount > 1) {
    score += dupBoost;
    reasons.push(`${reportCount} reports +${dupBoost}`);
  }

  if (URGENT_WORDS.test(description)) {
    score += 25;
    reasons.push('safety keywords +25');
  }

  if (reopenCount > 0 && status !== 'resolved') {
    const boost = 15 * Math.min(reopenCount, 2);
    score += boost;
    reasons.push(`reopened after a claimed fix +${boost}`);
  }

  const sla = slaOf({ category, createdAt, status }, now);
  if (sla.overdue) {
    score += 20;
    reasons.push(`past the ${sla.hours}h deadline +20`);
  }

  if (status !== 'resolved') {
    const ageBoost = Math.min(20, Math.floor((now - createdAt) / (24 * HOUR)) * 4);
    if (ageBoost > 0) {
      score += ageBoost;
      reasons.push(`unresolved for days +${ageBoost}`);
    }
  }

  const label = score >= 60 ? 'critical' : score >= 45 ? 'high' : score >= 25 ? 'medium' : 'low';
  return { score, label, reasons, sla };
}
