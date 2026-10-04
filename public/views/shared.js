import { session } from '../api.js';
import { badge, formatDate, h } from '../dom.js';
import { campusMap, issuePins } from './campus-map.js';

let meta;
export async function getMeta(api) {
  meta ??= await api('/meta');
  return meta;
}

export const categoryLabel = (m, key) => m.categories.find((c) => c.key === key)?.label ?? key;

export function issueCard(issue, m, { actions } = {}) {
  return h('article', { class: 'card issue' },
    h('div', { class: 'row between' },
      h('h3', {}, h('a', { href: `#/${session.user.role === 'student' ? '' : 'admin/'}issue/${issue.id}` }, issue.title)),
      h('div', { class: 'row' },
        issue.sla.overdue && badge('overdue', 'critical'),
        badge(issue.priority.label, issue.priority.label),
        badge(issue.status, `status-${issue.status}`),
        issue.status !== 'resolved' && (issue.acknowledged_at
          ? h('span', { class: 'badge ack', title: `Acknowledged by ${issue.acknowledged_by}` }, 'acknowledged')
          : h('span', { class: 'badge unack', title: 'The team has not confirmed it has seen this yet' }, 'not yet acknowledged')))),
    h('div', { class: 'meta' },
      h('span', {}, `${issue.location}${issue.detail ? ` - ${issue.detail}` : ''}`),
      h('span', {}, categoryLabel(m, issue.category)),
      h('span', { class: 'badge count', title: 'Students who reported this problem' }, `${issue.report_count} report${issue.report_count === 1 ? '' : 's'}`),
      h('span', {}, `Reported ${formatDate(issue.created_at)}`),
      issue.assigned_to && h('span', {}, `Assigned to ${issue.assigned_to}`),
      issue.acknowledged_at && h('span', {}, `Acknowledged by ${issue.acknowledged_by}, ${formatDate(issue.acknowledged_at)}`)),
    actions);
}

export function timeline(log) {
  return h('ol', { class: 'timeline' }, log.map((entry) =>
    h('li', {},
      h('time', {}, formatDate(entry.created_at)),
      h('strong', {}, entry.status.replace(/_/g, ' ')),
      entry.note && h('div', {}, entry.note),
      h('div', { class: 'muted' }, `by ${entry.actor}`))));
}

export function emptyState(title, text, link) {
  return h('div', { class: 'card' }, h('h2', {}, title), h('p', { class: 'muted' }, text),
    link && h('a', { class: 'button', href: link.href }, link.text));
}

// Where the problem is, on the schematic campus map.
export function whereCard(m, issue) {
  const map = campusMap(m, { label: `Map showing ${issue.location}` });
  map.setPlace(issue.location);
  map.setPins(issuePins(m, [issue]));
  return h('div', { class: 'card' },
    h('h2', {}, 'Where'),
    h('p', { class: 'muted' }, `${issue.location}${issue.detail ? `, ${issue.detail}` : ''}. ${issue.pin_x != null ? 'The reporter marked the exact spot.' : 'The exact spot was not marked.'}`),
    h('div', { class: 'map-wrap' }, map.el));
}
