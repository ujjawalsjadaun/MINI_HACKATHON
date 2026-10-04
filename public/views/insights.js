import { api } from '../api.js';
import { formatDate, h } from '../dom.js';
import { route } from '../router.js';
import { emptyState } from './shared.js';

const tile = (value, text, hint) => h('div', { class: 'card' },
  h('div', { class: 'stat' }, value),
  h('div', {}, text),
  hint && h('div', { class: 'hint' }, hint));

function bars(title, rows, { name, value, note }) {
  const max = Math.max(1, ...rows.map(value));
  return h('div', { class: 'card' },
    h('h2', {}, title),
    rows.length
      ? h('div', { class: 'bars' }, rows.map((row) => h('div', { class: 'bar' },
        h('span', { title: name(row) }, name(row)),
        h('div', { class: 'track', role: 'img', 'aria-label': `${name(row)}: ${value(row)}` },
          h('div', { class: 'fill', style: `width:${(value(row) / max) * 100}%` })),
        h('strong', {}, value(row)))))
      : h('p', { class: 'muted' }, note ?? 'No data yet.'));
}

route('/insights', ['admin'], async () => {
  const d = await api('/insights');
  const t = d.totals;
  if (!t.issues) return emptyState('No insights yet', 'Insights appear once students start reporting issues.');

  return h('section', {},
    h('h1', {}, 'Campus insights'),
    h('div', { class: 'grid' },
      tile(t.active, 'Active issues', `${t.resolved} resolved of ${t.issues}`),
      tile(t.reports, 'Student reports', `grouped into ${t.issues} underlying issues`),
      tile(t.duplicates_merged, 'Duplicates merged', 'complaints the team no longer triages twice'),
      tile(t.avg_resolution_hours == null ? '-' : `${t.avg_resolution_hours}h`, 'Avg. time to resolve', 'across resolved issues')),

    h('div', { class: 'card' },
      h('h2', {}, 'Recurring problems'),
      h('p', { class: 'muted' }, 'The same kind of fault at the same place, again and again. These point to a root cause, not a one-off repair.'),
      d.recurring.length
        ? h('ul', {}, d.recurring.map((r) => h('li', {}, h('strong', {}, `${r.label} at ${r.location}`), ` - ${r.occurrences} separate issues, last on ${formatDate(r.last_seen)}`)))
        : h('p', { class: 'muted' }, 'No recurring problems detected yet.')),

    h('div', { class: 'card' },
      h('h2', {}, `Stuck for more than ${d.stale.after_days} days`),
      d.stale.issues.length
        ? h('ul', {}, d.stale.issues.map((i) => h('li', {},
          h('a', { href: `#/admin/issue/${i.id}` }, i.title), ` - ${i.location}, ${i.status.replace(/_/g, ' ')} since ${formatDate(i.created_at)}`)))
        : h('p', { class: 'muted' }, 'Nothing is overdue.')),

    h('div', { class: 'grid' },
      bars('Issues by location (hotspots)', d.hotspots, { name: (r) => r.location, value: (r) => r.issues }),
      bars('Issues by category', d.by_category, { name: (r) => r.label, value: (r) => r.count }),
      bars('Active workload by team', d.by_department, { name: (r) => r.department, value: (r) => r.active ?? 0 }),
      bars('Issues by status', d.by_status, { name: (r) => r.status.replace(/_/g, ' '), value: (r) => r.count })));
});
