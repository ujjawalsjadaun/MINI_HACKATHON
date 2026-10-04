import { api, session } from '../api.js';
import { h, toast } from '../dom.js';
import { go, route } from '../router.js';
import { getMeta } from './shared.js';

// For accounts that have no security question yet (created before the feature), or to change the current one.
route('/security', ['student', 'staff'], async () => {
  const m = await getMeta(api);
  const question = h('select', { id: 'sec-q', required: true },
    h('option', { value: '' }, 'Choose a question'),
    m.securityQuestions.map((q) => h('option', { value: q }, q)));
  const answer = h('input', { id: 'sec-a', required: true, minlength: 3, maxlength: 60, autocomplete: 'off' });
  const password = h('input', { id: 'sec-pw', type: 'password', required: true, autocomplete: 'current-password' });
  const error = h('p', { class: 'error', role: 'alert' });
  const save = h('button', { class: 'primary', type: 'submit' }, 'Save security question');

  return h('section', { class: 'card', style: 'max-width:560px' },
    h('h1', {}, 'Security question'),
    h('p', { class: 'muted' }, session.user.security_set
      ? 'You have a security question. Saving a new one replaces it.'
      : 'You have not set one yet. Without it you cannot reset a forgotten password.'),
    h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        error.textContent = '';
        save.disabled = true;
        try {
          await api('/me/security-question', { method: 'PUT', body: { password: password.value, question: question.value, answer: answer.value } });
          session.user.security_set = true;
          toast('Security question saved.');
          go('/security');
        } catch (err) {
          error.textContent = err.message;
          save.disabled = false;
        }
      },
    },
    h('label', { for: 'sec-q' }, 'Question'), question,
    h('label', { for: 'sec-a' }, 'Your answer'), answer,
    h('p', { class: 'hint' }, 'Not case-sensitive. Choose something only you know.'),
    h('label', { for: 'sec-pw' }, 'Your current password (to confirm it is you)'), password,
    error,
    h('div', { class: 'row', style: 'margin-top:1rem' }, save)));
});
