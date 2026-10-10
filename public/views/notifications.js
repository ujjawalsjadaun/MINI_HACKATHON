import { api, session } from '../api.js';
import { formatDate, h, toast } from '../dom.js';
import { t } from '../i18n.js';
import { go, route } from '../router.js';
import { emptyState } from './shared.js';

// Each kind of notification is a sentence with the details filled in. The wording is translated here,
// so people read it in their own language even though the server only stored the kind and details.
const SENTENCES = {
  acknowledged: (p) => t('The team has seen your report "{title}". Acknowledged by {name}.', p),
  assigned: (p) => t('"{title}" has been assigned to {name}.', p),
  in_progress: (p) => t('Work has started on "{title}".', p),
  needs_confirmation: (p) => t('The team says "{title}" is fixed. Please confirm it, or reopen it.', p),
  note: (p) => t('The team posted an update on "{title}".', p),
  assigned_you: (p) => t('"{title}" was assigned to you.', p),
  reopened: (p) => t('A reporter says "{title}" is not fixed.', p),
  resolved: (p) => t('"{title}" was confirmed as fixed.', p),
  new_emergency: (p) => t('Emergency report at {place}: "{title}".', p),
};

const issuePath = (id) => (session.user.role === 'student' ? `/issue/${id}` : `/admin/issue/${id}`);

route('/notifications', ['student', 'staff', 'admin'], async () => {
  const { items, unread } = await api('/notifications');

  const markAll = async () => {
    try {
      await api('/notifications/read', { method: 'POST', body: {} });
      window.dispatchEvent(new Event('notifications:changed'));
      go('/notifications');
    } catch (err) { toast(err.message, 'error'); }
  };

  const open = async (n) => {
    if (!n.read) { try { await api('/notifications/read', { method: 'POST', body: { ids: [n.id] } }); } catch { /* opening the issue matters more */ } }
    window.dispatchEvent(new Event('notifications:changed'));
    go(issuePath(n.issue_id));
  };

  const item = (n) => h('div', { class: `card notification${n.read ? '' : ' unread'}` },
    h('div', { class: 'row between' },
      h('div', {},
        h('p', { style: 'margin:0' }, n.read ? null : h('span', { class: 'dot', 'aria-hidden': 'true' }), n.read ? null : h('span', { class: 'sr-only' }, t('New')), (SENTENCES[n.kind] ?? (() => ''))(n.params)),
        n.params.note && h('p', { class: 'hint', style: 'margin:.25rem 0 0' }, `"${n.params.note}"`),
        h('p', { class: 'hint', style: 'margin:.25rem 0 0' }, formatDate(n.created_at))),
      h('button', { class: 'secondary', type: 'button', onclick: () => open(n) }, t('Open'))));

  return h('section', {},
    h('div', { class: 'row between' },
      h('h1', {}, t('Notifications')),
      unread > 0 && h('button', { class: 'secondary', type: 'button', onclick: markAll }, t('Mark all as read'))),
    items.length
      ? items.map(item)
      : emptyState(t('Nothing new'), t('You will see updates about your reports and your work here.')));
});
