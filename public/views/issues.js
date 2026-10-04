import { api } from '../api.js';
import { badge, formatDate, h, toast } from '../dom.js';
import { go, route } from '../router.js';
import { emptyState, getMeta, issueCard, timeline } from './shared.js';

route('/mine', ['student'], async () => {
  const [m, issues] = await Promise.all([getMeta(api), api('/issues?mine=1')]);
  return h('section', {},
    h('h1', {}, 'My complaints'),
    h('p', { class: 'muted' }, 'Every problem you reported or confirmed, with its latest status.'),
    issues.length
      ? issues.map((issue) => issueCard(issue, m))
      : emptyState('Nothing reported yet', 'When you report a campus issue it will show up here with live status.', { href: '#/report', text: 'Report an issue' }));
});

route('/feed', ['student'], async () => {
  const [m, issues, mine] = await Promise.all([getMeta(api), api('/issues?status=active'), api('/issues?mine=1')]);
  const mineIds = new Set(mine.map((i) => i.id));

  const meToo = (issue) => {
    const button = h('button', {
      class: 'secondary', type: 'button',
      onclick: async () => {
        button.disabled = true;
        try {
          await api(`/issues/${issue.id}/me-too`, { method: 'POST' });
          toast('Added. The report count and priority went up.');
          go('/feed');
        } catch (err) {
          toast(err.message, 'error');
          button.disabled = false;
        }
      },
    }, 'Me too');
    return h('div', { class: 'row', style: 'margin-top:.75rem' }, button,
      h('span', { class: 'hint' }, 'Seeing this problem as well? Confirm it instead of filing a new report.'));
  };

  return h('section', {},
    h('h1', {}, 'Campus feed'),
    h('p', { class: 'muted' }, 'Open problems across campus, most urgent first. Confirm ones you have also seen.'),
    issues.length
      ? issues.map((issue) => issueCard(issue, m, {
        actions: mineIds.has(issue.id) ? h('p', { class: 'hint' }, 'You reported this problem.') : meToo(issue),
      }))
      : emptyState('No open issues', 'Everything reported so far has been resolved.'));
});

route('/issue/:id', ['student'], async ({ id }) => {
  const [m, detail] = await Promise.all([getMeta(api), api(`/issues/${id}`)]);
  const { issue, reports, log } = detail;
  return h('section', {},
    h('p', {}, h('a', { href: '#/mine' }, '< Back to my complaints')),
    issueCard(issue, m),
    h('div', { class: 'card' },
      h('h2', {}, 'Progress'),
      timeline(log)),
    reports.length > 0 && h('div', { class: 'card reports' },
      h('h2', {}, 'Your report'),
      reports.map((r) => h('div', {},
        h('p', {}, r.description),
        r.match_reason && h('p', { class: 'hint' }, `Grouped with an existing issue: ${r.match_reason}`),
        r.photo && h('img', { class: 'photo', src: r.photo, alt: 'Photo you attached to this report' }),
        h('p', { class: 'hint' }, formatDate(r.created_at))))),
    issue.status === 'resolved' && h('div', { class: 'notice ok' }, badge('resolved', 'status-resolved'), ' This issue has been resolved.'));
});
