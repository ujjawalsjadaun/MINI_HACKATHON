import { api, session } from './api.js';
import { h, toast } from './dom.js';
import { currentPath, go, homeFor, matchRoute } from './router.js';
import { authView } from './views/auth.js';
import './views/admin.js';
import './views/issues.js';
import './views/report.js';

const main = document.getElementById('main');
const nav = document.getElementById('nav');

const NAV = {
  admin: [['/admin', 'Issues'], ['/insights', 'Insights']],
  student: [['/report', 'Report issue'], ['/mine', 'My complaints'], ['/feed', 'Campus feed']],
};

function renderNav() {
  const user = session.user;
  const current = currentPath();
  nav.replaceChildren(
    ...(user ? NAV[user.role] : []).map(([path, text]) =>
      h('a', { href: `#${path}`, 'aria-current': current.startsWith(path) ? 'page' : null }, text)),
    user && h('span', { class: 'who' }, `${user.name} (${user.role})`),
    user && h('button', { type: 'button', onclick: signOut }, 'Sign out'),
  );
}

async function signOut() {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* token may already be invalid */ }
  session.token = null;
  session.user = null;
  go('/login');
}

function showError(err) {
  main.replaceChildren(h('div', { class: 'card' }, h('h1', {}, 'Something went wrong'), h('p', { class: 'error' }, err.message)));
}

async function render() {
  const path = currentPath();
  const user = session.user;
  if (!user && path !== '/login') return go('/login');
  if (user && (path === '/login' || path === '/')) return go(homeFor(user));

  renderNav();
  if (path === '/login') return main.replaceChildren(authView());

  const found = matchRoute(path);
  if (!found) return main.replaceChildren(h('div', { class: 'card' }, h('h1', {}, 'Page not found')));
  if (!found.route.roles.includes(user.role)) return go(homeFor(user));

  main.replaceChildren(h('p', { class: 'muted' }, 'Loading...'));
  try {
    main.replaceChildren(await found.route.render(found.params));
    main.focus({ preventScroll: true });
  } catch (err) {
    showError(err);
  }
}

window.addEventListener('hashchange', render);
window.addEventListener('auth:expired', () => {
  session.token = null;
  session.user = null;
  toast('Your session expired. Please sign in again.', 'error');
  go('/login');
});

(async function boot() {
  if (session.token) {
    try { session.user = await api('/me'); } catch { session.token = null; }
  }
  render();
})();
