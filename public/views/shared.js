import { session } from '../api.js';
import { badge, formatDate, h } from '../dom.js';

let meta;
export async function getMeta(api) {
  meta ??= await api('/meta');
  return meta;
}

export const categoryLabel = (m, key) => m.categories.find((c) => c.key === key)?.label ?? key;

export function issueCard(issue, m, { actions } = {}) {
  return h('article', { class: 'card issue' },
    h('div', { class: 'row between' },
      h('h3', {}, h('a', { href: `#/${session.user.role === 'admin' ? 'admin/' : ''}issue/${issue.id}` }, issue.title)),
      h('div', { class: 'row' },
        issue.sla.overdue && badge('overdue', 'critical'),
        badge(issue.priority.label, issue.priority.label),
        badge(issue.status, `status-${issue.status}`))),
    h('div', { class: 'meta' },
      h('span', {}, `${issue.location}${issue.detail ? ` - ${issue.detail}` : ''}`),
      h('span', {}, categoryLabel(m, issue.category)),
      h('span', { class: 'badge count', title: 'Students who reported this problem' }, `${issue.report_count} report${issue.report_count === 1 ? '' : 's'}`),
      h('span', {}, `Reported ${formatDate(issue.created_at)}`),
      issue.assigned_to && h('span', {}, `Assigned to ${issue.assigned_to}`)),
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
