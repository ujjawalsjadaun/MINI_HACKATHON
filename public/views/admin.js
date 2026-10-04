import { api, session } from '../api.js';
import { badge, formatDate, h, toast } from '../dom.js';
import { t } from '../i18n.js';
import { go, route } from '../router.js';
import { categoryLabel, emptyState, getMeta, issueCard, noteText, priorityReason, timeline, whereCard } from './shared.js';

const option = (value, text, selected) => h('option', { value, selected: selected ? true : null }, text);

route('/admin', ['admin', 'staff'], async () => {
  const isStaff = session.user.role === 'staff';
  const m = await getMeta(api);
  const params = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const filters = { status: params.get('status') ?? 'active', category: params.get('category') ?? '', location: params.get('location') ?? '' };

  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
  const issues = await api(`/issues?${query}`);

  const apply = () => {
    const q = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    location.hash = `/admin?${q}`;
  };
  const filter = (id, text, key, options) => h('div', {},
    h('label', { for: id }, text),
    h('select', { id, onchange: (e) => { filters[key] = e.target.value; apply(); } }, options));

  const critical = issues.filter((i) => i.priority.label === 'critical').length;
  return h('section', {},
    h('div', { class: 'row between' },
      h('h1', {}, t(isStaff ? 'My assigned issues' : 'Issue queue')),
      h('p', { class: 'muted' }, `${t(issues.length === 1 ? '{n} issue' : '{n} issues', { n: issues.length })}${critical ? t(', {n} critical', { n: critical }) : ''}${t(' - most urgent first')}`)),
    h('div', { class: 'filters' },
      filter('f-status', t('Status'), 'status', [
        option('active', t('Active (not resolved)'), filters.status === 'active'),
        option('', t('All'), filters.status === ''),
        ...m.statuses.map((s) => option(s, t(s.replace(/_/g, ' ')), filters.status === s))]),
      filter('f-category', t('Category'), 'category', [
        option('', t('All categories'), !filters.category),
        ...m.categories.map((c) => option(c.key, t(c.label), filters.category === c.key))]),
      filter('f-location', t('Location'), 'location', [
        option('', t('All locations'), !filters.location),
        ...m.locations.map((l) => option(l, l, filters.location === l))])),
    issues.length
      ? issues.map((issue) => issueCard(issue, m, {
        actions: h('p', { class: 'hint' }, `${t('Routed to {dept}. Priority {score}: {reasons}.', { dept: t(issue.department), score: issue.priority.score, reasons: issue.priority.reasons.map(priorityReason).join(', ') })}${issue.sla.overdue ? ` ${t('Overdue by {n}h (deadline {hours}h).', { n: issue.sla.overdue_hours, hours: issue.sla.hours })}` : ''}`),
      }))
      : emptyState(t('No issues match'), t('Try a different filter.')));
});

route('/admin/issue/:id', ['admin', 'staff'], async ({ id }) => {
  const isAdmin = session.user.role === 'admin';
  const [m, detail, staff] = await Promise.all([getMeta(api), api(`/issues/${id}`), isAdmin ? api('/staff') : []]);
  const { issue, reports, log } = detail;

  // Teams cannot close an issue themselves: only a reporter's confirmation resolves it.
  const statusText = { awaiting_confirmation: t('Fixed - ask reporters to confirm') };
  const status = h('select', { id: 'status' }, m.statuses
    .filter((s) => s !== 'resolved' || issue.status === 'resolved')
    .map((s) => option(s, statusText[s] ?? t(s.replace(/_/g, ' ')), issue.status === s)));
  // Admins assign to a named staff member (own department first); staff see who it is assigned to.
  const byDept = [...staff].sort((a, b) => (b.department === issue.department) - (a.department === issue.department));
  const assignee = h('select', { id: 'assignee' },
    h('option', { value: '' }, t('Unassigned')),
    byDept.map((s) => h('option', { value: s.id, selected: s.name === issue.assigned_to ? true : null }, `${s.name} (${t(s.department)})`)));
  const note = h('textarea', { id: 'note', maxlength: 300, placeholder: t('Visible to students on the progress timeline') });
  const error = h('p', { class: 'error', role: 'alert' });
  const save = h('button', { class: 'primary', type: 'submit' }, t('Save update'));

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      error.textContent = '';
      save.disabled = true;
      try {
        const body = { status: status.value, note: note.value };
        if (status.value === issue.status) delete body.status;
        if (isAdmin && (assignee.value === '' ? null : Number(assignee.value)) !== (staff.find((s) => s.name === issue.assigned_to)?.id ?? null)) {
          body.assignee_id = assignee.value === '' ? null : Number(assignee.value);
        }
        await api(`/issues/${id}`, { method: 'PATCH', body });
        toast(t('Issue updated. Students can see the new status.'));
        go(`/admin/issue/${id}`);
      } catch (err) {
        error.textContent = err.message;
        save.disabled = false;
      }
    },
  },
  h('label', { for: 'status' }, t('Status')), status,
  h('label', { for: 'assignee' }, t('Assigned to')),
  isAdmin ? assignee : h('p', {}, issue.assigned_to ?? t('Unassigned')),
  h('label', { for: 'note' }, t('Note (optional)')), note,
  error,
  h('div', { class: 'row', style: 'margin-top:1rem' }, save));

  const acknowledgePanel = !issue.acknowledged_at && issue.status !== 'resolved' && h('div', { class: 'notice' },
    h('strong', {}, t('Not acknowledged yet')),
    h('p', { class: 'hint' }, t('Let the reporters know the team has seen this, even before work starts.')),
    h('button', {
      class: 'primary', type: 'button',
      onclick: async (e) => {
        e.target.disabled = true;
        try {
          await api(`/issues/${id}/acknowledge`, { method: 'POST' });
          toast(t('Acknowledged. Reporters can see that the team has seen it.'));
          go(`/admin/issue/${id}`);
        } catch (err) {
          toast(err.message, 'error');
          e.target.disabled = false;
        }
      },
    }, t('Acknowledge this issue')));

  return h('section', {},
    h('p', {}, h('a', { href: '#/admin' }, t('< Back to queue'))),
    issueCard(issue, m),
    whereCard(m, issue),
    acknowledgePanel,
    h('div', { class: 'card' },
      h('h2', {}, t('Why this priority')),
      h('p', {}, t('Score {score}: {reasons}.', { score: issue.priority.score, reasons: issue.priority.reasons.map(priorityReason).join(', ') })),
      h('p', { class: issue.sla.overdue ? 'error' : 'muted' }, issue.sla.overdue
        ? t('Overdue by {n} hours (deadline for this category: {hours}h).', { n: issue.sla.overdue_hours, hours: issue.sla.hours })
        : t('Deadline for this category: {hours}h from the report.', { hours: issue.sla.hours })),
      h('p', { class: 'muted' }, t('{category} issues are routed to {dept}.', { category: categoryLabel(m, issue.category), dept: t(issue.department) }))),
    h('div', { class: 'grid' },
      h('div', { class: 'card' }, h('h2', {}, t('Update')), form),
      h('div', { class: 'card' }, h('h2', {}, t('Progress')), timeline(log))),
    h('div', { class: 'card reports' },
      h('h2', {}, t(reports.length === 1 ? '{n} report grouped into this issue' : '{n} reports grouped into this issue', { n: reports.length })),
      reports.map((r) => h('div', { style: 'border-top:1px solid var(--border);padding:.75rem 0' },
        h('strong', {}, r.reporter ?? t('Student')), ' ', h('span', { class: 'hint' }, formatDate(r.created_at)),
        h('p', {}, noteText(r.description)),
        r.match_reason && h('p', { class: 'hint' }, t('Auto-grouped: {reason}', { reason: noteText(r.match_reason) })),
        r.photo && h('a', { href: r.photo, target: '_blank', rel: 'noopener' }, h('img', { class: 'photo', src: r.photo, alt: t('Photo from {name}', { name: r.reporter ?? t('a student') }) }))))),
    issue.reopen_count > 0 && h('p', { class: 'hint' }, t(issue.reopen_count === 1 ? 'Reopened {n} time after a claimed fix.' : 'Reopened {n} times after a claimed fix.', { n: issue.reopen_count })),
    issue.status === 'resolved' && badge('resolved', 'status-resolved'));
});
