import { session } from '../api.js';
import { badge, formatDate, h } from '../dom.js';
import { t } from '../i18n.js';
import { campusMap, issuePins } from './campus-map.js';

let meta;
export async function getMeta(api) {
  meta ??= await api('/meta');
  return meta;
}

// Five stars, filled up to the rounded rating, readable as text for screen readers.
export function stars(value) {
  const filled = Math.round(value);
  return h('span', { class: 'stars', role: 'img', 'aria-label': t('{value} out of 5', { value }) },
    '\u2605'.repeat(filled), h('span', { class: 'off' }, '\u2605'.repeat(5 - filled)));
}

export const categoryLabel = (m, key) => t(m.categories.find((c) => c.key === key)?.label ?? key);

// The server writes its score breakdown, timeline notes and match explanations in English with numbers and names
// built in. These helpers recognise each pattern and translate it; anything else is shown as it was written.
const match = (text, pattern) => pattern.exec(text);

export function priorityReason(reason) {
  let m;
  if ((m = match(reason, /^category severity \+(\d+)$/))) return t('category severity +{n}', { n: m[1] });
  if ((m = match(reason, /^(\d+) reports \+(\d+)$/))) return t('{count} reports +{n}', { count: m[1], n: m[2] });
  if ((m = match(reason, /^reporter marked it (\w+) \+(\d+)$/))) return t('reporter marked it {level} +{n}', { level: t(m[1]), n: m[2] });
  if ((m = match(reason, /^safety keywords \+(\d+)$/))) return t('safety keywords +{n}', { n: m[1] });
  if ((m = match(reason, /^reopened after a claimed fix \+(\d+)$/))) return t('reopened after a claimed fix +{n}', { n: m[1] });
  if ((m = match(reason, /^past the (\d+)h deadline \+(\d+)$/))) return t('past the {hours}h deadline +{n}', { hours: m[1], n: m[2] });
  if ((m = match(reason, /^unresolved for days \+(\d+)$/))) return t('unresolved for days +{n}', { n: m[1] });
  return reason;
}

export function noteText(note) {
  let m;
  if ((m = match(note, /^Reported and routed to (.+)$/))) return t('Reported and routed to {dept}', { dept: t(m[1]) });
  if ((m = match(note, /^Reopened: ([\s\S]+)$/))) return t('Reopened: {note}', { note: t(m[1]) });
  if ((m = match(note, /^Assigned to (.+?)(?: - ([\s\S]*))?$/))) return t('Assigned to {name}', { name: m[1] }) + (m[2] ? ` - ${t(m[2])}` : '');
  if ((m = match(note, /^Unassigned(?: - ([\s\S]*))?$/))) return t('Unassigned') + (m[1] ? ` - ${t(m[1])}` : '');
  if ((m = match(note, /^Same category and location \((.+)\); (\d+)% wording overlap$/))) return t('Same category and location ({place}); {pct}% wording overlap', { place: m[1], pct: m[2] });
  return t(note);
}

export function issueCard(issue, m, { actions } = {}) {
  return h('article', { class: 'card issue' },
    h('div', { class: 'row between' },
      h('h3', {}, h('a', { href: `#/${session.user.role === 'student' ? '' : 'admin/'}issue/${issue.id}` }, issue.title)),
      h('div', { class: 'row' },
        issue.sla.overdue && badge('overdue', 'critical'),
        badge(issue.priority.label, issue.priority.label),
        badge(issue.status, `status-${issue.status}`),
        issue.status !== 'resolved' && (issue.acknowledged_at
          ? h('span', { class: 'badge ack', title: t('Acknowledged by {name}', { name: issue.acknowledged_by }) }, t('acknowledged'))
          : h('span', { class: 'badge unack', title: t('The team has not confirmed it has seen this yet') }, t('not yet acknowledged'))))),
    h('div', { class: 'meta' },
      h('span', {}, `${issue.location}${issue.detail ? ` - ${issue.detail}` : ''}`),
      h('span', {}, categoryLabel(m, issue.category)),
      h('span', { class: 'badge count', title: t('Students who reported this problem') }, t(issue.report_count === 1 ? '{n} report' : '{n} reports', { n: issue.report_count })),
      issue.feedback_count > 0 && h('span', { class: 'badge count', title: t('Average student rating of the fix') }, stars(issue.feedback_avg), ` ${issue.feedback_avg} (${issue.feedback_count})`),
      h('span', {}, t('Reported {date}', { date: formatDate(issue.created_at) })),
      issue.assigned_to && h('span', {}, t('Assigned to {name}', { name: issue.assigned_to })),
      issue.acknowledged_at && h('span', {}, t('Acknowledged by {name}, {date}', { name: issue.acknowledged_by, date: formatDate(issue.acknowledged_at) }))),
    actions);
}

export function timeline(log) {
  return h('ol', { class: 'timeline' }, log.map((entry) =>
    h('li', {},
      h('time', {}, formatDate(entry.created_at)),
      h('strong', {}, t(entry.status.replace(/_/g, ' '))),
      entry.note && h('div', {}, noteText(entry.note)),
      h('div', { class: 'muted' }, t('by {actor}', { actor: t(entry.actor) })))));
}

export function emptyState(title, text, link) {
  return h('div', { class: 'card' }, h('h2', {}, title), h('p', { class: 'muted' }, text),
    link && h('a', { class: 'button', href: link.href }, link.text));
}

// Where the problem is, on the schematic campus map.
export function whereCard(m, issue) {
  const map = campusMap(m, { label: t('Map showing {place}', { place: issue.location }) });
  map.setPlace(issue.location);
  map.setPins(issuePins(m, [issue]));
  return h('div', { class: 'card' },
    h('h2', {}, t('Where')),
    h('p', { class: 'muted' }, `${issue.location}${issue.detail ? `, ${issue.detail}` : ''}. ${t(issue.pin_x != null ? 'The reporter marked the exact spot.' : 'The exact spot was not marked.')}`),
    h('div', { class: 'map-wrap' }, map.el));
}

// What students said about the fix. Staff see comments without names; admins also see who wrote them.
export function feedbackCard(feedback) {
  return h('div', { class: 'card' },
    h('h2', {}, t('Student feedback')),
    feedback.count
      ? [
        h('p', {}, stars(feedback.average), ' ', t(feedback.count === 1 ? 'Rated {avg} out of 5 by {n} student' : 'Rated {avg} out of 5 by {n} students', { avg: feedback.average, n: feedback.count })),
        ...feedback.entries.map((e) => h('div', { style: 'border-top:1px solid var(--border);padding:.6rem 0' },
          stars(e.rating), ' ', h('span', { class: 'hint' }, `${formatDate(e.created_at)}${e.reporter ? ` - ${e.reporter}` : ''}`),
          e.comment && h('p', {}, e.comment))),
      ]
      : h('p', { class: 'muted' }, t('No feedback yet.')));
}
