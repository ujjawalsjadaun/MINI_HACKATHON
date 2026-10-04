import { api } from '../api.js';
import { h, toast } from '../dom.js';
import { go, startSession } from '../router.js';
import { t } from '../i18n.js';
import { getMeta } from './shared.js';

function signInCard() {
  let mode = 'login';
  const card = h('div', { class: 'card narrow' });

  function draw() {
    const isLogin = mode === 'login';
    const error = h('p', { class: 'error', role: 'alert' });
    const submit = h('button', { class: 'primary', type: 'submit' }, t(isLogin ? 'Sign in' : 'Create account'));
    const name = h('input', { id: 'name', autocomplete: 'name', required: true, minlength: 2 });
    const email = h('input', { id: 'email', type: 'email', autocomplete: 'email', required: true });
    const password = h('input', {
      id: 'password', type: 'password', required: true, minlength: isLogin ? 1 : 6,
      autocomplete: isLogin ? 'current-password' : 'new-password',
    });

    // Chosen now so the password can be reset later without email.
    const question = h('select', { id: 'sec-q', required: true }, h('option', { value: '' }, t('Choose a question')));
    const answer = h('input', { id: 'sec-a', required: true, minlength: 3, maxlength: 60, autocomplete: 'off' });
    // The option value stays English because that is what the server checks; only the shown text is translated.
    if (!isLogin) getMeta(api).then((m) => question.append(...m.securityQuestions.map((q) => h('option', { value: q }, t(q))))).catch(() => {});

    const form = h('form', {
      novalidate: false,
      onsubmit: async (e) => {
        e.preventDefault();
        error.textContent = '';
        submit.disabled = true;
        try {
          const body = isLogin
            ? { email: email.value, password: password.value }
            : { name: name.value, email: email.value, password: password.value, securityQuestion: question.value, securityAnswer: answer.value };
          startSession(await api(isLogin ? '/auth/login' : '/auth/register', { method: 'POST', body }));
        } catch (err) {
          error.textContent = err.message;
          submit.disabled = false;
        }
      },
    },
    !isLogin && [h('label', { for: 'name' }, t('Full name')), name],
    h('label', { for: 'email' }, t('Email')), email,
    h('label', { for: 'password' }, t('Password')), password,
    !isLogin && h('p', { class: 'hint' }, t('At least 6 characters.')),
    !isLogin && [
      h('label', { for: 'sec-q' }, t('Security question (used if you forget your password)')), question,
      h('label', { for: 'sec-a' }, t('Your answer')), answer,
      h('p', { class: 'hint' }, t('Not case-sensitive. Choose something only you know.')),
    ],
    isLogin && h('p', { class: 'hint' }, h('a', { href: '#/forgot' }, t('Forgot your password?'))),
    error,
    h('div', { class: 'row', style: 'margin-top:1rem' }, submit,
      h('button', { class: 'secondary', type: 'button', onclick: () => { mode = isLogin ? 'register' : 'login'; draw(); } },
        t(isLogin ? 'New here? Register' : 'Have an account? Sign in'))));

    card.replaceChildren(
      h('h1', {}, t(isLogin ? 'Sign in to CampusFix' : 'Create your account')),
      h('p', { class: 'muted' }, t('Report broken lights, Wi-Fi, leaks and more. Track every complaint until it is fixed.')),
      form,
    );
  }
  draw();
  return card;
}


// Facts and live notices from the host institute's official site (see server/institute.js for sources).
function aboutPanel() {
  const panel = h('aside', { class: 'card about', 'aria-label': t('About the institute') });
  api('/institute').then((info) => {
    // h() flattens lists and skips false, which replaceChildren does not.
    panel.replaceChildren(...h('div', {},
      h('h2', {}, t('About {name}', { name: info.short })),
      h('p', {}, t(info.status), '. ', t(info.established), '.'),
      h('p', { class: 'muted' }, t(info.campus)),
      h('h3', {}, t('Vision')), h('p', {}, t(info.vision)),
      h('h3', {}, t('Mission')), h('ul', {}, info.mission.map((m) => h('li', {}, t(m)))),
      info.notices.length > 0 && [
        h('h3', {}, t('Latest notices from the institute')),
        h('ul', { class: 'notices' }, info.notices.map((n) => h('li', {},
          h('a', { href: n.url, target: '_blank', rel: 'noopener' }, n.title),
          n.date && h('span', { class: 'hint' }, ` - ${n.date}`)))),
      ],
      h('p', { class: 'hint' }, `${info.address}. ${t('Phone {phone}.', { phone: info.phone })}`),
      h('p', { class: 'hint' }, t('Source: '),
        info.sources.flatMap((s, i) => [i > 0 && ', ', h('a', { href: s.url, target: '_blank', rel: 'noopener' }, t(s.label))]),
        t(' (retrieved {date}). CampusFix is a student project, not an official service of the institute.', { date: info.retrieved }))).childNodes);
  }).catch(() => panel.remove()); // the panel is a bonus: the sign-in form works without it
  return panel;
}

export const authView = () => h('div', { class: 'auth-wrap' }, signInCard(), aboutPanel());


// Reset without email: answer the security question chosen at registration.
export function forgotView() {
  const email = h('input', { id: 'ask-email', type: 'email', autocomplete: 'email', required: true });
  const askError = h('p', { class: 'error', role: 'alert' });
  const step = h('div', { 'aria-live': 'polite' });

  const showQuestion = (question) => {
    const answer = h('input', { id: 'reset-answer', autocomplete: 'off', required: true, maxlength: 100 });
    const password = h('input', { id: 'new-password', type: 'password', autocomplete: 'new-password', required: true, minlength: 6 });
    const error = h('p', { class: 'error', role: 'alert' });
    const button = h('button', { class: 'primary', type: 'submit' }, t('Set new password'));
    step.replaceChildren(h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        error.textContent = '';
        button.disabled = true;
        try {
          await api('/auth/reset-password', { method: 'POST', body: { email: email.value, answer: answer.value, password: password.value } });
          toast(t('Password changed. Sign in with your new password.'));
          go('/login');
        } catch (err) {
          error.textContent = err.message;
          button.disabled = false;
        }
      },
    },
    h('div', { class: 'notice' }, h('strong', {}, t(question))),
    h('label', { for: 'reset-answer' }, t('Your answer')), answer,
    h('label', { for: 'new-password' }, t('New password')), password,
    h('p', { class: 'hint' }, t('At least 6 characters. You will be signed out on all devices. Admin accounts cannot be reset this way.')), error,
    h('div', { class: 'row', style: 'margin-top:1rem' }, button)));
    answer.focus();
  };

  return h('div', { class: 'narrow' },
    h('div', { class: 'card' },
      h('h1', {}, t('Forgot your password?')),
      h('p', { class: 'muted' }, t('Answer the security question you chose when you registered.')),
      h('form', {
        onsubmit: async (e) => {
          e.preventDefault();
          askError.textContent = '';
          try {
            const { question } = await api(`/auth/security-question?email=${encodeURIComponent(email.value)}`);
            showQuestion(question);
          } catch (err) { askError.textContent = err.message; }
        },
      },
      h('label', { for: 'ask-email' }, t('Your account email')), email, askError,
      h('div', { class: 'row', style: 'margin-top:1rem' }, h('button', { class: 'primary', type: 'submit' }, t('Show my question')))),
      step),
    h('p', {}, h('a', { href: '#/login' }, t('< Back to sign in'))));
}
