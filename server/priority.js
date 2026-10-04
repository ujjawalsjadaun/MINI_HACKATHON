import { CATEGORIES } from './config.js';

const HOUR = 3_600_000;
const URGENT_WORDS = /\b(spark|sparks|sparking|short.?circuit|shock|fire|smoke|flood|flooding|burst|exposed|wire|sewage|overflow|injur|danger|unsafe|collapse)/i;

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

  if (status !== 'resolved') {
    const ageBoost = Math.min(20, Math.floor((now - createdAt) / (24 * HOUR)) * 4);
    if (ageBoost > 0) {
      score += ageBoost;
      reasons.push(`unresolved for days +${ageBoost}`);
    }
  }

  const label = score >= 60 ? 'critical' : score >= 45 ? 'high' : score >= 25 ? 'medium' : 'low';
  return { score, label, reasons };
}
