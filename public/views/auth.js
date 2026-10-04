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

// Ask the admin office to approve a reset. This page waits, and as soon as an admin approves it the
// new-password form appears. A typed code is the fallback for someone who closed the page.
export function forgotView() {
  const POLL_MS = 3000;
  const WAIT_LIMIT_MS = 30 * 60 * 1000;
  const requestBox = h('div', { 'aria-live': 'polite' });
  const requestError = h('p', { class: 'error', role: 'alert' });
  const askEmail = h('input', { id: 'ask-email', type: 'email', autocomplete: 'email', required: true });

  const passwordForm = (id) => {
    const password = h('input', { id: `pw-${id}`, type: 'password', autocomplete: 'new-password', required: true, minlength: 6 });
    const error = h('p', { class: 'error', role: 'alert' });
    const button = h('button', { class: 'primary', type: 'submit' }, 'Set new password');
    return { password, error, button };
  };

  async function finish(body, error, button) {
    error.textContent = '';
    button.disabled = true;
    try {
      await api('/auth/reset', { method: 'POST', body });
      toast('Password changed. Sign in with your new password.');
      go('/login');
    } catch (err) {
      error.textContent = err.message;
      button.disabled = false;
    }
  }

  function showApproved(token) {
    const { password, error, button } = passwordForm('token');
    requestBox.replaceChildren(h('div', { class: 'notice ok' },
      h('strong', {}, 'Approved by the admin office. '), 'Choose a new password. This works for the next 30 minutes.',
      h('form', { onsubmit: (e) => { e.preventDefault(); finish({ token, password: password.value }, error, button); } },
        h('label', { for: 'pw-token' }, 'New password'), password,
        h('p', { class: 'hint' }, 'At least 6 characters. You will be signed out on all devices.'), error,
        h('div', { class: 'row', style: 'margin-top:.75rem' }, button))));
    password.focus();
  }

  function waitForApproval(token) {
    const started = Date.now();
    requestBox.replaceChildren(h('div', { class: 'notice' },
      h('strong', {}, 'Request sent. Waiting for the admin office to approve it...'),
      h('p', { class: 'hint' }, 'Visit the admin office with your college ID card. Keep this page open: it updates by itself as soon as they approve, and then asks for your new password.')));
    const timer = setInterval(async () => {
      // Stop when the user leaves this page or has waited long enough.
      if (location.hash !== '#/forgot' || Date.now() - started > WAIT_LIMIT_MS) return clearInterval(timer);
      try {
        const { status } = await api(`/auth/forgot/status?token=${encodeURIComponent(token)}`);
        if (status === 'approved') { clearInterval(timer); showApproved(token); }
      } catch { /* a network blip: keep waiting */ }
    }, POLL_MS);
  }

  const ask = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      requestError.textContent = '';
      try {
        const { request_token: token } = await api('/auth/forgot', { method: 'POST', body: { email: askEmail.value } });
        email.value = askEmail.value;
        waitForApproval(token);
      } catch (err) { requestError.textContent = err.message; }
    },
  },
  h('label', { for: 'ask-email' }, 'Your account email'), askEmail, requestError,
  h('div', { class: 'row', style: 'margin-top:1rem' }, h('button', { class: 'primary', type: 'submit' }, 'Request a reset')), requestBox);

  // Fallback: a one-time code read out by the admin office.
  const email = h('input', { id: 'reset-email', type: 'email', autocomplete: 'email', required: true });
  const code = h('input', { id: 'code', autocomplete: 'one-time-code', required: true, maxlength: 20, placeholder: 'e.g. K7M2QX9P' });
  const codeForm = passwordForm('code');
  const withCode = h('details', { class: 'card' },
    h('summary', {}, 'I already have a code from the admin office'),
    h('form', { onsubmit: (e) => { e.preventDefault(); finish({ email: email.value, code: code.value, password: codeForm.password.value }, codeForm.error, codeForm.button); } },
      h('label', { for: 'reset-email' }, 'Email'), email,
      h('label', { for: 'code' }, 'Reset code'), code,
      h('label', { for: 'pw-code' }, 'New password'), codeForm.password,
      codeForm.error, h('div', { class: 'row', style: 'margin-top:.75rem' }, codeForm.button)));

  return h('div', { class: 'narrow' },
    h('div', { class: 'card' },
      h('h1', {}, 'Forgot your password?'),
      h('p', { class: 'muted' }, 'There is no email service in this demo, so the admin office confirms who you are and approves the reset.'),
      ask),
    withCode,
    h('p', {}, h('a', { href: '#/login' }, '< Back to sign in')));
}
