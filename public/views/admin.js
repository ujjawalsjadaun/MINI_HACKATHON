import { api } from '../api.js';
import { badge, formatDate, h, toast } from '../dom.js';
import { go, route } from '../router.js';
import { categoryLabel, emptyState, getMeta, issueCard, timeline } from './shared.js';

const option = (value, text, selected) => h('option', { value, selected: selected ? true : null }, text);

route('/admin', ['admin'], async () => {
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
      h('h1', {}, 'Issue queue'),
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
        actions: h('p', { class: 'hint' }, `Routed to ${issue.department}. Priority ${issue.priority.score}: ${issue.priority.reasons.join(', ')}.`),
      }))
      : emptyState('No issues match', 'Try a different filter.'));
});

route('/admin/issue/:id', ['admin'], async ({ id }) => {
  const [m, detail] = await Promise.all([getMeta(api), api(`/issues/${id}`)]);
  const { issue, reports, log } = detail;

  const status = h('select', { id: 'status' }, m.statuses.map((s) => option(s, s.replace(/_/g, ' '), issue.status === s)));
  const assignee = h('input', { id: 'assignee', maxlength: 80, value: issue.assigned_to ?? '', placeholder: `e.g. a technician from ${issue.department}` });
  const note = h('textarea', { id: 'note', maxlength: 300, placeholder: 'Visible to students on the progress timeline' });
  const error = h('p', { class: 'error', role: 'alert' });
  const save = h('button', { class: 'primary', type: 'submit' }, 'Save update');

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      error.textContent = '';
      save.disabled = true;
      try {
        const body = { status: status.value, assigned_to: assignee.value, note: note.value };
        if (status.value === issue.status) delete body.status;
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
  h('label', { for: 'assignee' }, 'Assigned to'), assignee,
  h('label', { for: 'note' }, 'Note (optional)'), note,
  error,
  h('div', { class: 'row', style: 'margin-top:1rem' }, save));

  return h('section', {},
    h('p', {}, h('a', { href: '#/admin' }, '< Back to queue')),
    issueCard(issue, m),
    h('div', { class: 'card' },
      h('h2', {}, 'Why this priority'),
      h('p', {}, `Score ${issue.priority.score}: ${issue.priority.reasons.join(', ')}.`),
      h('p', { class: 'muted' }, `${categoryLabel(m, issue.category)} issues are routed to ${issue.department}.`)),
    h('div', { class: 'grid' },
      h('div', { class: 'card' }, h('h2', {}, 'Update'), form),
      h('div', { class: 'card' }, h('h2', {}, 'Progress'), timeline(log))),
    h('div', { class: 'card reports' },
      h('h2', {}, `${reports.length} report${reports.length === 1 ? '' : 's'} grouped into this issue`),
      reports.map((r) => h('div', { style: 'border-top:1px solid var(--border);padding:.75rem 0' },
        h('strong', {}, r.reporter), ' ', h('span', { class: 'hint' }, formatDate(r.created_at)),
        h('p', {}, r.description),
        r.match_reason && h('p', { class: 'hint' }, `Auto-grouped: ${r.match_reason}`),
        r.photo && h('a', { href: r.photo, target: '_blank', rel: 'noopener' }, h('img', { class: 'photo', src: r.photo, alt: `Photo from ${r.reporter}` }))))),
    issue.status === 'resolved' && badge('resolved', 'status-resolved'));
});
