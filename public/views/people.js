import { api, session } from '../api.js';
import { h, toast } from '../dom.js';
import { t } from '../i18n.js';
import { go, route } from '../router.js';
import { emptyState } from './shared.js';

const roleLabel = (role) => t(role);

// Admin only: the team behind the queue. Accounts are created here instead of by a script.
route('/admin/people', ['admin'], async () => {
  const { people, students, departments } = await api('/people');

  const option = (value, text, selected) => h('option', { value, selected: selected ? true : null }, text);
  const departmentSelect = (id, current) => h('select', { id },
    departments.map((d) => option(d, t(d), d === current)));

  // ---- add a person
  const name = h('input', { id: 'p-name', required: true, minlength: 2, maxlength: 80, autocomplete: 'off' });
  const email = h('input', { id: 'p-email', type: 'email', required: true, autocomplete: 'off', placeholder: 'name@nitap.ac.in' });
  const role = h('select', { id: 'p-role' }, option('staff', t('Staff'), true), option('admin', t('Admin')));
  const department = departmentSelect('p-department', departments[0]);
  const departmentRow = h('div', {}, h('label', { for: 'p-department' }, t('Department')), department);
  role.addEventListener('change', () => { departmentRow.hidden = role.value === 'admin'; });
  const password = h('input', { id: 'p-password', type: 'password', required: true, minlength: 8, maxlength: 100, autocomplete: 'new-password' });
  const error = h('p', { class: 'error', role: 'alert' });
  const add = h('button', { class: 'primary', type: 'submit' }, t('Add person'));

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      error.textContent = '';
      add.disabled = true;
      try {
        await api('/people', { method: 'POST', body: { name: name.value, email: email.value, role: role.value, department: department.value, password: password.value } });
        toast(t('Account created. Give them the password and ask them to keep it private.'));
        go('/admin/people');
      } catch (err) {
        error.textContent = err.message;
        add.disabled = false;
      }
    },
  },
  h('div', { class: 'filters' },
    h('div', {}, h('label', { for: 'p-name' }, t('Full name')), name),
    h('div', {}, h('label', { for: 'p-email' }, t('Email')), email)),
  h('div', { class: 'filters' },
    h('div', {}, h('label', { for: 'p-role' }, t('Role')), role),
    departmentRow,
    h('div', {}, h('label', { for: 'p-password' }, t('Starting password')), password)),
  h('p', { class: 'hint' }, t('At least 8 characters. Share it in person or by phone, not in a group chat.')),
  error,
  h('div', { class: 'row', style: 'margin-top:.75rem' }, add));

  // ---- one card per person
  const patch = async (person, body, message) => {
    try {
      await api(`/people/${person.id}`, { method: 'PATCH', body });
      toast(message);
      go('/admin/people');
    } catch (err) { toast(err.message, 'error'); }
  };

  const card = (p) => {
    const isMe = p.id === session.user.id;
    const resetBox = h('div', { class: 'row', hidden: true, style: 'margin-top:.5rem' });
    const newPassword = h('input', { type: 'password', minlength: 8, maxlength: 100, autocomplete: 'new-password', 'aria-label': t('New password') });
    resetBox.append(newPassword, h('button', {
      class: 'primary', type: 'button',
      onclick: () => patch(p, { password: newPassword.value }, t('Password changed. {name} has been signed out everywhere.', { name: p.name })),
    }, t('Set password')));

    const deptSelect = p.role === 'staff' ? departmentSelect(`dept-${p.id}`, p.department) : null;
    deptSelect?.addEventListener('change', () => patch(p, { department: deptSelect.value }, t('Department updated.')));

    return h('div', { class: `card${p.active ? '' : ' inactive'}` },
      h('div', { class: 'row between' },
        h('div', {},
          h('strong', {}, p.name), ' ', isMe && h('span', { class: 'hint' }, t('(you)')),
          h('div', { class: 'hint' }, p.email)),
        h('div', { class: 'row' },
          h('span', { class: 'badge count' }, roleLabel(p.role)),
          h('span', { class: `badge ${p.active ? 'low' : 'critical'}` }, t(p.active ? 'Active' : 'Deactivated')))),
      p.role === 'staff' && h('div', { class: 'row', style: 'margin-top:.5rem' },
        h('label', { for: `dept-${p.id}`, style: 'margin:0' }, t('Department')), deptSelect,
        h('span', { class: 'hint' }, t(p.open_issues === 1 ? '{n} open issue' : '{n} open issues', { n: p.open_issues }))),
      h('div', { class: 'row', style: 'margin-top:.75rem' },
        h('button', { class: 'secondary', type: 'button', onclick: () => { resetBox.hidden = !resetBox.hidden; if (!resetBox.hidden) newPassword.focus(); } }, t('Reset password')),
        !isMe && h('button', {
          class: 'secondary', type: 'button',
          onclick: () => {
            if (p.active && !confirm(t('Deactivate {name}? They are signed out at once and their open issues go back to the queue.', { name: p.name }))) return;
            patch(p, { active: !p.active }, t(p.active ? '{name} has been deactivated.' : '{name} can sign in again.', { name: p.name }));
          },
        }, t(p.active ? 'Deactivate' : 'Reactivate'))),
      resetBox);
  };

  return h('section', {},
    h('h1', {}, t('People')),
    h('p', { class: 'muted' }, t(students === 1 ? 'The team behind the queue. {n} student has registered.' : 'The team behind the queue. {n} students have registered.', { n: students })),
    h('div', { class: 'card' }, h('h2', {}, t('Add a staff member or admin')), form),
    people.length ? people.map(card) : emptyState(t('No team members yet'), t('Add the first staff member above.')));
});
