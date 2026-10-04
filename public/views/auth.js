import { api } from '../api.js';
import { h, toast } from '../dom.js';
import { go, startSession } from '../router.js';

function signInCard() {
  let mode = 'login';
  const card = h('div', { class: 'card narrow' });

  function draw() {
    const isLogin = mode === 'login';
    const error = h('p', { class: 'error', role: 'alert' });
    const submit = h('button', { class: 'primary', type: 'submit' }, isLogin ? 'Sign in' : 'Create account');
    const name = h('input', { id: 'name', autocomplete: 'name', required: true, minlength: 2 });
    const email = h('input', { id: 'email', type: 'email', autocomplete: 'email', required: true });
    const password = h('input', {
      id: 'password', type: 'password', required: true, minlength: isLogin ? 1 : 6,
      autocomplete: isLogin ? 'current-password' : 'new-password',
    });

    const form = h('form', {
      novalidate: false,
      onsubmit: async (e) => {
        e.preventDefault();
        error.textContent = '';
        submit.disabled = true;
        try {
          const body = isLogin
            ? { email: email.value, password: password.value }
            : { name: name.value, email: email.value, password: password.value };
          startSession(await api(isLogin ? '/auth/login' : '/auth/register', { method: 'POST', body }));
        } catch (err) {
          error.textContent = err.message;
          submit.disabled = false;
        }
      },
    },
    !isLogin && [h('label', { for: 'name' }, 'Full name'), name],
    h('label', { for: 'email' }, 'Email'), email,
    h('label', { for: 'password' }, 'Password'), password,
    !isLogin && h('p', { class: 'hint' }, 'At least 6 characters.'),
    isLogin && h('p', { class: 'hint' }, h('a', { href: '#/forgot' }, 'Forgot your password?')),
    error,
    h('div', { class: 'row', style: 'margin-top:1rem' }, submit,
      h('button', { class: 'secondary', type: 'button', onclick: () => { mode = isLogin ? 'register' : 'login'; draw(); } },
        isLogin ? 'New here? Register' : 'Have an account? Sign in')));

    card.replaceChildren(
      h('h1', {}, isLogin ? 'Sign in to CampusFix' : 'Create your account'),
      h('p', { class: 'muted' }, 'Report broken lights, Wi-Fi, leaks and more. Track every complaint until it is fixed.'),
      form,
    );
  }
  draw();
  return card;
}


// Facts and live notices from the host institute's official site (see server/institute.js for sources).
function aboutPanel() {
  const panel = h('aside', { class: 'card about', 'aria-label': 'About the institute' });
  api('/institute').then((info) => {
    // h() flattens lists and skips false, which replaceChildren does not.
    panel.replaceChildren(...h('div', {},
      h('h2', {}, `About ${info.short}`),
      h('p', {}, info.status, '. ', info.established, '.'),
      h('p', { class: 'muted' }, info.campus),
      h('h3', {}, 'Vision'), h('p', {}, info.vision),
      h('h3', {}, 'Mission'), h('ul', {}, info.mission.map((m) => h('li', {}, m))),
      info.notices.length > 0 && [
        h('h3', {}, 'Latest notices from the institute'),
        h('ul', { class: 'notices' }, info.notices.map((n) => h('li', {},
          h('a', { href: n.url, target: '_blank', rel: 'noopener' }, n.title),
          n.date && h('span', { class: 'hint' }, ` - ${n.date}`)))),
      ],
      h('p', { class: 'hint' }, `${info.address}. Phone ${info.phone}.`),
      h('p', { class: 'hint' }, 'Source: ',
        info.sources.flatMap((s, i) => [i > 0 && ', ', h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.label)]),
        ` (retrieved ${info.retrieved}). CampusFix is a student project, not an official service of the institute.`)).childNodes);
  }).catch(() => panel.remove()); // the panel is a bonus: the sign-in form works without it
  return panel;
}

export const authView = () => h('div', { class: 'auth-wrap' }, signInCard(), aboutPanel());

// Two steps: ask the admin office for a code, then set a new password with it.
export function forgotView() {
  const asked = h('div', { 'aria-live': 'polite' });
  const requestError = h('p', { class: 'error', role: 'alert' });
  const resetError = h('p', { class: 'error', role: 'alert' });
  const askEmail = h('input', { id: 'ask-email', type: 'email', autocomplete: 'email', required: true });
  const email = h('input', { id: 'reset-email', type: 'email', autocomplete: 'email', required: true });
  const code = h('input', { id: 'code', autocomplete: 'one-time-code', required: true, maxlength: 20, placeholder: 'e.g. K7M2QX9P', style: 'text-transform:uppercase' });
  const password = h('input', { id: 'new-password', type: 'password', autocomplete: 'new-password', required: true, minlength: 6 });

  const ask = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      requestError.textContent = '';
      try {
        await api('/auth/forgot', { method: 'POST', body: { email: askEmail.value } });
        email.value = askEmail.value;
        asked.replaceChildren(h('div', { class: 'notice ok' },
          h('strong', {}, 'Request sent. '),
          'If that email has an account, the admin office can now see your request. Visit them with your college ID card; they will give you a one-time code that works for 30 minutes. Then enter it in step 2.'));
      } catch (err) { requestError.textContent = err.message; }
    },
  },
  h('label', { for: 'ask-email' }, 'Your account email'), askEmail, requestError,
  h('div', { class: 'row', style: 'margin-top:1rem' }, h('button', { class: 'primary', type: 'submit' }, 'Request a reset code')), asked);

  const reset = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      resetError.textContent = '';
      try {
        await api('/auth/reset', { method: 'POST', body: { email: email.value, code: code.value, password: password.value } });
        toast('Password changed. Sign in with your new password.');
        go('/login');
      } catch (err) { resetError.textContent = err.message; }
    },
  },
  h('label', { for: 'reset-email' }, 'Email'), email,
  h('label', { for: 'code' }, 'Reset code from the admin office'), code,
  h('label', { for: 'new-password' }, 'New password'), password,
  h('p', { class: 'hint' }, 'At least 6 characters. You will be signed out on all devices.'), resetError,
  h('div', { class: 'row', style: 'margin-top:1rem' }, h('button', { class: 'primary', type: 'submit' }, 'Set new password')));

  return h('div', { class: 'narrow' },
    h('div', { class: 'card' },
      h('h1', {}, 'Forgot your password?'),
      h('p', { class: 'muted' }, 'There is no email service in this demo, so the admin office issues reset codes in person.'),
      h('h2', {}, '1. Ask for a code'), ask),
    h('div', { class: 'card' }, h('h2', {}, '2. Set a new password'), reset),
    h('p', {}, h('a', { href: '#/login' }, '< Back to sign in')));
}
