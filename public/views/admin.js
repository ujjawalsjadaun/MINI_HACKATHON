import { api, session } from '../api.js';
import { badge, formatDate, h, toast } from '../dom.js';
import { go, route } from '../router.js';
import { categoryLabel, emptyState, getMeta, issueCard, timeline } from './shared.js';

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
      h('h1', {}, isStaff ? 'My assigned issues' : 'Issue queue'),
      h('p', { class: 'muted' }, `${issues.length} issue${issues.length === 1 ? '' : 's'}${critical ? `, ${critical} critical` : ''} - most urgent first`)),
    h('div', { class: 'filters' },
      filter('f-status', 'Status', 'status', [
        option('active', 'Active (not resolved)', filters.status === 'active'),
        option('', 'All', filters.status === ''),
        ...m.statuses.map((s) => option(s, s.replace(/_/g, ' '), filters.status === s))]),
      filter('f-category', 'Category', 'category', [
        option('', 'All categories', !filters.category),
        ...m.categories.map((c) => option(c.key, c.label, filters.category === c.key))]),
      filter('f-location', 'Location', 'location', [
        option('', 'All locations', !filters.location),
        ...m.locations.map((l) => option(l, l, filters.location === l))])),
    issues.length
      ? issues.map((issue) => issueCard(issue, m, {
        actions: h('p', { class: 'hint' }, `Routed to ${issue.department}. Priority ${issue.priority.score}: ${issue.priority.reasons.join(', ')}.${issue.sla.overdue ? ` Overdue by ${issue.sla.overdue_hours}h (deadline ${issue.sla.hours}h).` : ''}`),
      }))
      : emptyState('No issues match', 'Try a different filter.'));
});

route('/admin/issue/:id', ['admin', 'staff'], async ({ id }) => {
  const isAdmin = session.user.role === 'admin';
  const [m, detail, staff] = await Promise.all([getMeta(api), api(`/issues/${id}`), isAdmin ? api('/staff') : []]);
  const { issue, reports, log } = detail;

  // Teams cannot close an issue themselves: only a reporter's confirmation resolves it.
  const statusText = { awaiting_confirmation: 'Fixed - ask reporters to confirm' };
  const status = h('select', { id: 'status' }, m.statuses
    .filter((s) => s !== 'resolved' || issue.status === 'resolved')
    .map((s) => option(s, statusText[s] ?? s.replace(/_/g, ' '), issue.status === s)));
  // Admins assign to a named staff member (own department first); staff see who it is assigned to.
  const byDept = [...staff].sort((a, b) => (b.department === issue.department) - (a.department === issue.department));
  const assignee = h('select', { id: 'assignee' },
    h('option', { value: '' }, 'Unassigned'),
    byDept.map((s) => h('option', { value: s.id, selected: s.name === issue.assigned_to ? true : null }, `${s.name} (${s.department})`)));
  const note = h('textarea', { id: 'note', maxlength: 300, placeholder: 'Visible to students on the progress timeline' });
  const error = h('p', { class: 'error', role: 'alert' });
  const save = h('button', { class: 'primary', type: 'submit' }, 'Save update');

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
        toast('Issue updated. Students can see the new status.');
        go(`/admin/issue/${id}`);
      } catch (err) {
        error.textContent = err.message;
        save.disabled = false;
      }
    },
  },
  h('label', { for: 'status' }, 'Status'), status,
  h('label', { for: 'assignee' }, 'Assigned to'),
  isAdmin ? assignee : h('p', {}, issue.assigned_to ?? 'Unassigned'),
  h('label', { for: 'note' }, 'Note (optional)'), note,
  error,
  h('div', { class: 'row', style: 'margin-top:1rem' }, save));

  const acknowledgePanel = !issue.acknowledged_at && issue.status !== 'resolved' && h('div', { class: 'notice' },
    h('strong', {}, 'Not acknowledged yet'),
    h('p', { class: 'hint' }, 'Let the reporters know the team has seen this, even before work starts.'),
    h('button', {
      class: 'primary', type: 'button',
      onclick: async (e) => {
        e.target.disabled = true;
        try {
          await api(`/issues/${id}/acknowledge`, { method: 'POST' });
          toast('Acknowledged. Reporters can see that the team has seen it.');
          go(`/admin/issue/${id}`);
        } catch (err) {
          toast(err.message, 'error');
          e.target.disabled = false;
        }
      },
    }, 'Acknowledge this issue'));

  return h('section', {},
    h('p', {}, h('a', { href: '#/admin' }, '< Back to queue')),
    issueCard(issue, m),
    acknowledgePanel,
    h('div', { class: 'card' },
      h('h2', {}, 'Why this priority'),
      h('p', {}, `Score ${issue.priority.score}: ${issue.priority.reasons.join(', ')}.`),
      h('p', { class: issue.sla.overdue ? 'error' : 'muted' }, issue.sla.overdue
        ? `Overdue by ${issue.sla.overdue_hours} hours (deadline for this category: ${issue.sla.hours}h).`
        : `Deadline for this category: ${issue.sla.hours}h from the report.`),
      h('p', { class: 'muted' }, `${categoryLabel(m, issue.category)} issues are routed to ${issue.department}.`)),
    h('div', { class: 'grid' },
      h('div', { class: 'card' }, h('h2', {}, 'Update'), form),
      h('div', { class: 'card' }, h('h2', {}, 'Progress'), timeline(log))),
    h('div', { class: 'card reports' },
      h('h2', {}, `${reports.length} report${reports.length === 1 ? '' : 's'} grouped into this issue`),
      reports.map((r) => h('div', { style: 'border-top:1px solid var(--border);padding:.75rem 0' },
        h('strong', {}, r.reporter ?? 'Student'), ' ', h('span', { class: 'hint' }, formatDate(r.created_at)),
        h('p', {}, r.description),
        r.match_reason && h('p', { class: 'hint' }, `Auto-grouped: ${r.match_reason}`),
        r.photo && h('a', { href: r.photo, target: '_blank', rel: 'noopener' }, h('img', { class: 'photo', src: r.photo, alt: `Photo from ${r.reporter ?? 'a student'}` }))))),
    issue.reopen_count > 0 && h('p', { class: 'hint' }, `Reopened ${issue.reopen_count} time${issue.reopen_count === 1 ? '' : 's'} after a claimed fix.`),
    issue.status === 'resolved' && badge('resolved', 'status-resolved'));
});

route('/admin/resets', ['admin'], async () => {
  const shown = h('div', { 'aria-live': 'polite' });
  const list = h('div');

  const issue = (r) => async (e) => {
    e.target.disabled = true;
    try {
      const { code, expires_at: expiresAt } = await api(`/admin/resets/${r.id}/code`, { method: 'POST' });
      shown.replaceChildren(h('div', { class: 'notice ok' },
        h('strong', {}, `Approved for ${r.name}. `),
        'Their open reset page now asks for a new password by itself. If they closed it, give them this one-time code in person: ',
        h('span', { class: 'reset-code' }, code),
        h('p', { class: 'hint' }, `Check their college ID first. Valid until ${formatDate(expiresAt)}, works once, and is not shown again.`)));
      await draw();
    } catch (err) { toast(err.message, 'error'); }
    e.target.disabled = false;
  };

  async function draw() {
    const requests = await api('/admin/resets');
    list.replaceChildren(...(requests.length
      ? requests.map((r) => h('article', { class: 'card' },
        h('div', { class: 'row between' },
          h('div', {}, h('h3', {}, r.name), h('p', { class: 'muted' }, `${r.email} (${r.role}) - requested ${formatDate(r.requested_at)}`),
            r.code_active ? h('p', { class: 'hint' }, `Approved, open until ${formatDate(r.expires_at)}. Approving again cancels the earlier approval.`) : null),
          h('button', { class: r.code_active ? 'secondary' : 'primary', type: 'button', onclick: issue(r) }, r.code_active ? 'Approve again' : 'Approve reset'))))
      : [emptyState('No pending requests', 'When someone uses "Forgot your password?" they will show up here.')]));
  }
  await draw();

  // New requests appear without reloading; stop when the admin leaves the page.
  const timer = setInterval(() => {
    if (location.hash !== '#/admin/resets') return clearInterval(timer);
    draw().catch(() => {});
  }, 8000);

  return h('section', {},
    h('h1', {}, 'Password reset requests'),
    h('p', { class: 'muted' }, 'Check who is asking (for example their college ID), then approve. Their open page continues by itself. This list refreshes automatically.'),
    shown, list);
});
