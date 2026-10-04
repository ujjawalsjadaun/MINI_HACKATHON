import { api } from '../api.js';
import { badge, formatDate, h, toast } from '../dom.js';
import { go, route } from '../router.js';
import { emptyState, getMeta, issueCard, timeline } from './shared.js';

function confirmPanel(id) {
  const note = h('textarea', { id: 'reopen-note', maxlength: 300, placeholder: 'If it is not fixed, tell us what is still wrong (optional)' });
  const act = (path, body, message) => async (e) => {
    e.target.disabled = true;
    try {
      await api(`/issues/${id}/${path}`, { method: 'POST', body });
      toast(message);
      go(`/issue/${id}`);
    } catch (err) {
      toast(err.message, 'error');
      e.target.disabled = false;
    }
  };
  return h('div', { class: 'notice' },
    h('strong', {}, 'The team says this is fixed. Is it?'),
    h('p', { class: 'hint' }, 'The issue only closes when a reporter confirms the fix actually happened.'),
    h('label', { for: 'reopen-note' }, 'Note'), note,
    h('div', { class: 'row', style: 'margin-top:.75rem' },
      h('button', { class: 'primary', type: 'button', onclick: act('confirm', undefined, 'Thanks. Marked as resolved.') }, 'Yes, it is fixed'),
      h('button', { class: 'secondary', type: 'button', onclick: (e) => act('reopen', { note: note.value }, 'Reopened. The team has been notified.')(e) }, 'No, reopen it')));
}

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
      h('h2', {}, 'Why this priority'),
      h('p', {}, `${issue.priority.label}, score ${issue.priority.score}: ${issue.priority.reasons.join(', ')}.`),
      h('p', { class: issue.sla.overdue ? 'error' : 'muted' }, issue.sla.overdue
        ? `The team has passed its ${issue.sla.hours}h deadline for this kind of problem${issue.sla.overdue_hours > 0 ? ` by ${issue.sla.overdue_hours} hours` : ''}.`
        : `The team's deadline for this kind of problem is ${issue.sla.hours} hours from the report.`)),
    issue.acknowledged_at && issue.status !== 'resolved' && h('div', { class: 'notice ok' },
      h('strong', {}, 'The team has seen your report. '), `Acknowledged by ${issue.acknowledged_by} on ${formatDate(issue.acknowledged_at)}.`),
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
    detail.can_confirm && confirmPanel(issue.id),
    issue.status === 'resolved' && h('div', { class: 'notice ok' }, badge('resolved', 'status-resolved'), ' This issue has been resolved.'));
});
