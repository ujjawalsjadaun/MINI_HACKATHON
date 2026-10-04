import { api, session } from '../api.js';
import { h } from '../dom.js';
import { t } from '../i18n.js';
import { route } from '../router.js';
import { contactList } from './shared.js';

// The institute's emergency directory. It is fetched fresh each time so a change to the file shows at once.
route('/emergency', ['student', 'staff', 'admin'], async () => {
  const directory = await api('/emergency');
  return h('section', {},
    h('div', { class: 'row between' },
      h('h1', {}, t('Emergency contacts')),
      h('button', { class: 'secondary no-print', type: 'button', onclick: () => window.print() }, t('Print this page'))),
    h('div', { class: 'notice emergency-box' }, h('strong', {}, t('In danger right now? Call 112 first, then use the contacts below.'))),
    directory.groups.map((g) => h('div', { class: 'card' }, h('h2', {}, t(g.group)), contactList(g.entries))),
    h('p', { class: 'hint' }, t('Keep this directory accessible. For medical or security emergencies during night hours, contact the respective drivers, hostel manager, or security personnel immediately.')),
    session.user.role === 'admin' && !directory.configured && h('div', { class: 'notice no-print' },
      t('Only the public numbers are shown. Add the full directory in private/emergency-contacts.json (see the README).')));
});
