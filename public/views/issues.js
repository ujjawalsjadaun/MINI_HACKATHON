import { api } from '../api.js';
import { badge, formatDate, h, toast } from '../dom.js';
import { t } from '../i18n.js';
import { go, route } from '../router.js';
import { emptyState, getMeta, issueCard, noteText, priorityReason, timeline, whereCard } from './shared.js';

function confirmPanel(id) {
  const note = h('textarea', { id: 'reopen-note', maxlength: 300, placeholder: t('If it is not fixed, tell us what is still wrong (optional)') });
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
    h('strong', {}, t('The team says this is fixed. Is it?')),
    h('p', { class: 'hint' }, t('The issue only closes when a reporter confirms the fix actually happened.')),
    h('label', { for: 'reopen-note' }, t('Note')), note,
    h('div', { class: 'row', style: 'margin-top:.75rem' },
      h('button', { class: 'primary', type: 'button', onclick: act('confirm', undefined, t('Thanks. Marked as resolved.')) }, t('Yes, it is fixed')),
      h('button', { class: 'secondary', type: 'button', onclick: (e) => act('reopen', { note: note.value }, t('Reopened. The team has been notified.'))(e) }, t('No, reopen it'))));
}

route('/mine', ['student'], async () => {
  const [m, issues] = await Promise.all([getMeta(api), api('/issues?mine=1')]);
  return h('section', {},
    h('h1', {}, t('My complaints')),
    h('p', { class: 'muted' }, t('Every problem you reported or confirmed, with its latest status.')),
    issues.length
      ? issues.map((issue) => issueCard(issue, m))
      : emptyState(t('Nothing reported yet'), t('When you report a campus issue it will show up here with live status.'), { href: '#/report', text: t('Report an issue') }));
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
          toast(t('Added. The report count and priority went up.'));
          go('/feed');
        } catch (err) {
          toast(err.message, 'error');
          button.disabled = false;
        }
      },
    }, t('Me too'));
    return h('div', { class: 'row', style: 'margin-top:.75rem' }, button,
      h('span', { class: 'hint' }, t('Seeing this problem as well? Confirm it instead of filing a new report.')));
  };

  return h('section', {},
    h('h1', {}, t('Campus feed')),
    h('p', { class: 'muted' }, t('Open problems across campus, most urgent first. Confirm ones you have also seen.')),
    issues.length
      ? issues.map((issue) => issueCard(issue, m, {
        actions: mineIds.has(issue.id) ? h('p', { class: 'hint' }, t('You reported this problem.')) : meToo(issue),
      }))
      : emptyState(t('No open issues'), t('Everything reported so far has been resolved.')));
});

route('/issue/:id', ['student'], async ({ id }) => {
  const [m, detail] = await Promise.all([getMeta(api), api(`/issues/${id}`)]);
  const { issue, reports, log } = detail;
  return h('section', {},
    h('p', {}, h('a', { href: '#/mine' }, t('< Back to my complaints'))),
    issueCard(issue, m),
    whereCard(m, issue),
    h('div', { class: 'card' },
      h('h2', {}, t('Why this priority')),
      h('p', {}, t('{label}, score {score}: {reasons}.', { label: t(issue.priority.label), score: issue.priority.score, reasons: issue.priority.reasons.map(priorityReason).join(', ') })),
      h('p', { class: issue.sla.overdue ? 'error' : 'muted' }, issue.sla.overdue
        ? (issue.sla.overdue_hours > 0
          ? t('The team has passed its {hours}h deadline for this kind of problem by {n} hours.', { hours: issue.sla.hours, n: issue.sla.overdue_hours })
          : t('The team has passed its {hours}h deadline for this kind of problem.', { hours: issue.sla.hours }))
        : t("The team's deadline for this kind of problem is {hours} hours from the report.", { hours: issue.sla.hours }))),
    issue.acknowledged_at && issue.status !== 'resolved' && h('div', { class: 'notice ok' },
      h('strong', {}, t('The team has seen your report. ')), t('Acknowledged by {name} on {date}.', { name: issue.acknowledged_by, date: formatDate(issue.acknowledged_at) })),
    h('div', { class: 'card' },
      h('h2', {}, t('Progress')),
      timeline(log)),
    reports.length > 0 && h('div', { class: 'card reports' },
      h('h2', {}, t('Your report')),
      reports.map((r) => h('div', {},
        h('p', {}, noteText(r.description)),
        r.match_reason && h('p', { class: 'hint' }, t('Grouped with an existing issue: {reason}', { reason: noteText(r.match_reason) })),
        r.photo && h('img', { class: 'photo', src: r.photo, alt: t('Photo you attached to this report') }),
        h('p', { class: 'hint' }, formatDate(r.created_at))))),
    detail.can_confirm && confirmPanel(issue.id),
    issue.status === 'resolved' && h('div', { class: 'notice ok' }, badge('resolved', 'status-resolved'), t(' This issue has been resolved.')));
});
