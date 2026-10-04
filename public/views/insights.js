import { api } from '../api.js';
import { formatDate, h } from '../dom.js';
import { t } from '../i18n.js';
import { route } from '../router.js';
import { emptyState, stars } from './shared.js';

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
      : h('p', { class: 'muted' }, note ?? t('No data yet.')));
}

route('/insights', ['admin'], async () => {
  const d = await api('/insights');
  const totals = d.totals;
  if (!totals.issues) return emptyState(t('No insights yet'), t('Insights appear once students start reporting issues.'));

  return h('section', {},
    h('h1', {}, t('Campus insights')),
    h('div', { class: 'grid' },
      tile(totals.active, t('Active issues'), t('{resolved} resolved of {total}', { resolved: totals.resolved, total: totals.issues })),
      tile(totals.reports, t('Student reports'), t('grouped into {n} underlying issues', { n: totals.issues })),
      tile(totals.overdue, t('Overdue'), t('past their category deadline')),
      tile(totals.duplicates_merged, t('Duplicates merged'), t('complaints the team no longer triages twice')),
      tile(totals.reopened_issues, t('Reopened'), t(totals.reopens === 1 ? 'claimed fixes that did not hold ({n} reopening)' : 'claimed fixes that did not hold ({n} reopenings)', { n: totals.reopens })),
      tile(totals.avg_resolution_hours == null ? '-' : `${totals.avg_resolution_hours}h`, t('Avg. time to resolve'), t('across resolved issues')),
      tile(totals.avg_rating == null ? '-' : `${totals.avg_rating} / 5`, t('Fix rating'), totals.rated ? t(totals.rated === 1 ? 'average of {n} student rating' : 'average of {n} student ratings', { n: totals.rated }) : t('No ratings yet'))),

    d.overdue.length > 0 && h('div', { class: 'card' },
      h('h2', {}, t('Overdue issues')),
      h('p', { class: 'muted' }, t('Past the deadline for their category, so their priority has been raised.')),
      h('ul', {}, d.overdue.map((i) => h('li', {},
        h('a', { href: `#/admin/issue/${i.id}` }, i.title), t(' - {place}, overdue by {n}h (deadline {hours}h)', { place: i.location, n: i.sla.overdue_hours, hours: i.sla.hours }))))),

    h('div', { class: 'card' },
      h('h2', {}, t('Recurring problems')),
      h('p', { class: 'muted' }, t('The same kind of fault at the same place {min}+ times in {days} days. These point to a root cause, not a one-off repair.', { min: d.recurring_rule.min, days: d.recurring_rule.days })),
      d.recurring.length
        ? h('ul', {}, d.recurring.map((r) => h('li', {}, h('strong', {}, t('{label} at {place}', { label: t(r.label), place: r.location })), t(' - {n} separate issues in {days} days, last on {date}', { n: r.occurrences, days: d.recurring_rule.days, date: formatDate(r.last_seen) }))))
        : h('p', { class: 'muted' }, t('No recurring problems detected yet.'))),

    h('div', { class: 'card' },
      h('h2', {}, t('Stuck for more than {days} days', { days: d.stale.after_days })),
      d.stale.issues.length
        ? h('ul', {}, d.stale.issues.map((i) => h('li', {},
          h('a', { href: `#/admin/issue/${i.id}` }, i.title), t(' - {place}, {status} since {date}', { place: i.location, status: t(i.status.replace(/_/g, ' ')), date: formatDate(i.created_at) }))))
        : h('p', { class: 'muted' }, t('Nothing is overdue.'))),

    d.feedback.low.length > 0 && h('div', { class: 'card' },
      h('h2', {}, t('Lowest ratings')),
      h('p', { class: 'muted' }, t('Fixes rated 1 or 2 stars, with what students wrote.')),
      h('ul', {}, d.feedback.low.map((f) => h('li', {},
        h('a', { href: `#/admin/issue/${f.id}` }, f.title), ` - ${f.location} `, stars(f.rating), f.comment && ` ${f.comment}`)))),

    h('div', { class: 'grid' },
      bars(t('Issues by location (hotspots)'), d.hotspots, { name: (r) => r.location, value: (r) => r.issues }),
      bars(t('Avg. hours to resolve, by category'), d.resolution_by_category, { name: (r) => t(r.label), value: (r) => r.avg_hours, note: t('Appears once issues are resolved.') }),
      bars(t('Issues by category'), d.by_category, { name: (r) => t(r.label), value: (r) => r.count }),
      bars(t('Active workload by team'), d.by_department, { name: (r) => t(r.department), value: (r) => r.active ?? 0 }),
      bars(t('Average rating by category'), d.feedback.by_category, { name: (r) => t(r.label), value: (r) => r.average, note: t('Appears once students rate fixes.') }),
      bars(t('Issues by status'), d.by_status, { name: (r) => t(r.status.replace(/_/g, ' ')), value: (r) => r.count })));
});
