import { api, session } from '../api.js';
import { h, toast } from '../dom.js';
import { go, route } from '../router.js';
import { t } from '../i18n.js';
import { getMeta } from './shared.js';

// Change your own password (everyone), and set or change the security question used to reset a forgotten
// password (students and staff; an admin's password can only be reset by another admin).
function passwordCard() {
  const current = h('input', { id: 'pw-current', type: 'password', required: true, autocomplete: 'current-password' });
  const next = h('input', { id: 'pw-new', type: 'password', required: true, minlength: session.user.role === 'student' ? 6 : 8, maxlength: 100, autocomplete: 'new-password' });
  const again = h('input', { id: 'pw-again', type: 'password', required: true, autocomplete: 'new-password' });
  const error = h('p', { class: 'error', role: 'alert' });
  const save = h('button', { class: 'primary', type: 'submit' }, t('Change password'));

  return h('div', { class: 'card', style: 'max-width:560px' },
    h('h2', {}, t('Change your password')),
    h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        error.textContent = '';
        if (next.value !== again.value) { error.textContent = t('The two new passwords do not match.'); again.focus(); return; }
        save.disabled = true;
        try {
          await api('/me/password', { method: 'PUT', body: { current: current.value, password: next.value } });
          toast(t('Password changed. Your other devices have been signed out.'));
          go('/security');
        } catch (err) {
          error.textContent = err.message;
          save.disabled = false;
        }
      },
    },
    h('label', { for: 'pw-current' }, t('Your current password')), current,
    h('label', { for: 'pw-new' }, t('New password')), next,
    h('p', { class: 'hint' }, t(session.user.role === 'student' ? 'At least 6 characters.' : 'At least 8 characters.')),
    h('label', { for: 'pw-again' }, t('New password again')), again,
    error,
    h('div', { class: 'row', style: 'margin-top:1rem' }, save)));
}

async function questionCard() {
  const m = await getMeta(api);
  const question = h('select', { id: 'sec-q', required: true },
    h('option', { value: '' }, t('Choose a question')),
    m.securityQuestions.map((q) => h('option', { value: q }, t(q))));
  const answer = h('input', { id: 'sec-a', required: true, minlength: 3, maxlength: 60, autocomplete: 'off' });
  const password = h('input', { id: 'sec-pw', type: 'password', required: true, autocomplete: 'current-password' });
  const error = h('p', { class: 'error', role: 'alert' });
  const save = h('button', { class: 'primary', type: 'submit' }, t('Save security question'));

  return h('div', { class: 'card', style: 'max-width:560px' },
    h('h2', {}, t('Security question')),
    h('p', { class: 'muted' }, session.user.security_set
      ? t('You have a security question. Saving a new one replaces it.')
      : t('You have not set one yet. Without it you cannot reset a forgotten password.')),
    h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        error.textContent = '';
        save.disabled = true;
        try {
          await api('/me/security-question', { method: 'PUT', body: { password: password.value, question: question.value, answer: answer.value } });
          session.user.security_set = true;
          toast(t('Security question saved.'));
          go('/security');
        } catch (err) {
          error.textContent = err.message;
          save.disabled = false;
        }
      },
    },
    h('label', { for: 'sec-q' }, t('Question')), question,
    h('label', { for: 'sec-a' }, t('Your answer')), answer,
    h('p', { class: 'hint' }, t('Not case-sensitive. Choose something only you know.')),
    h('label', { for: 'sec-pw' }, t('Your current password (to confirm it is you)')), password,
    error,
    h('div', { class: 'row', style: 'margin-top:1rem' }, save)));
}

route('/security', ['student', 'staff', 'admin'], async () => h('section', {},
  h('h1', {}, t('Security')),
  passwordCard(),
  session.user.role === 'admin' ? null : await questionCard()));
