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

// Two steps: a one-time code is emailed to the account address, then the user sets a new password with it.
export function forgotView() {
  const sent = h('div', { 'aria-live': 'polite' });
  const askError = h('p', { class: 'error', role: 'alert' });
  const resetError = h('p', { class: 'error', role: 'alert' });
  const askEmail = h('input', { id: 'ask-email', type: 'email', autocomplete: 'email', required: true });
  const email = h('input', { id: 'reset-email', type: 'email', autocomplete: 'email', required: true });
  const code = h('input', { id: 'code', autocomplete: 'one-time-code', required: true, maxlength: 20, placeholder: 'e.g. K7M2QX9P' });
  const password = h('input', { id: 'new-password', type: 'password', autocomplete: 'new-password', required: true, minlength: 6 });
  const resetButton = h('button', { class: 'primary', type: 'submit' }, 'Set new password');
  const askButton = h('button', { class: 'primary', type: 'submit' }, 'Email me a code');

  // The code only lives for a short time: show how long is left, and stop the form once it has run out.
  const countdown = h('p', { class: 'countdown', role: 'timer' });
  let timer;
  function startCountdown(seconds) {
    clearInterval(timer);
    const endsAt = Date.now() + seconds * 1000;
    resetButton.disabled = false;
    const tick = () => {
      const left = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      if (left === 0) {
        clearInterval(timer);
        resetButton.disabled = true;
        countdown.className = 'countdown expired';
        countdown.textContent = 'The code has expired. Request a new one above.';
        return;
      }
      countdown.className = left <= 20 ? 'countdown low' : 'countdown';
      countdown.textContent = `Code expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    };
    tick();
    timer = setInterval(() => (location.hash === '#/forgot' ? tick() : clearInterval(timer)), 1000);
  }

  const ask = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      askError.textContent = '';
      askButton.disabled = true;
      try {
        const { delivery, expires_in: seconds } = await api('/auth/forgot', { method: 'POST', body: { email: askEmail.value } });
        email.value = askEmail.value;
        sent.replaceChildren(delivery === 'email'
          ? h('div', { class: 'notice ok' }, h('strong', {}, 'Check your email. '), 'If that address has an account, a code is on its way. It may land in spam. The code works once.')
          : h('div', { class: 'notice' }, h('strong', {}, 'Demo mode. '), 'Email sending is not set up on this server, so the code was printed in the server console instead of being emailed. (Set the SMTP settings from the README to send real emails.)'),
        countdown);
        startCountdown(seconds);
        code.focus();
      } catch (err) { askError.textContent = err.message; }
      askButton.disabled = false;
    },
  },
  h('label', { for: 'ask-email' }, 'Your registered email'), askEmail, askError,
  h('div', { class: 'row', style: 'margin-top:1rem' }, askButton), sent);

  const reset = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      resetError.textContent = '';
      resetButton.disabled = true;
      try {
        await api('/auth/reset', { method: 'POST', body: { email: email.value, code: code.value, password: password.value } });
        toast('Password changed. Sign in with your new password.');
        go('/login');
      } catch (err) {
        resetError.textContent = err.message;
        resetButton.disabled = false;
      }
    },
  },
  h('label', { for: 'reset-email' }, 'Email'), email,
  h('label', { for: 'code' }, 'Code from the email'), code,
  h('label', { for: 'new-password' }, 'New password'), password,
  h('p', { class: 'hint' }, 'At least 6 characters. You will be signed out on all devices.'), resetError,
  h('div', { class: 'row', style: 'margin-top:1rem' }, resetButton));

  return h('div', { class: 'narrow' },
    h('div', { class: 'card' }, h('h1', {}, 'Forgot your password?'), h('h2', {}, '1. Get a code'), ask),
    h('div', { class: 'card' }, h('h2', {}, '2. Set a new password'), reset),
    h('p', {}, h('a', { href: '#/login' }, '< Back to sign in')));
}
