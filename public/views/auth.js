import { api } from '../api.js';
import { h } from '../dom.js';
import { startSession } from '../router.js';

export function authView() {
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
