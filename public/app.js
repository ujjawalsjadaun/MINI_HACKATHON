import { api, session } from './api.js';
import { h, toast } from './dom.js';
import { currentPath, go, homeFor, matchRoute, rememberNext } from './router.js';
import { authView } from './views/auth.js';
import './views/admin.js';
import './views/qr.js';
import './views/insights.js';
import './views/issues.js';
import './views/report.js';

const main = document.getElementById('main');
const nav = document.getElementById('nav');

const NAV = {
  admin: [['/admin', 'Issues'], ['/insights', 'Insights'], ['/admin/qr', 'QR tags']],
  staff: [['/admin', 'My assignments']],
  student: [['/report', 'Report issue'], ['/mine', 'My complaints'], ['/feed', 'Campus feed']],
};

function renderNav() {
  const user = session.user;
  const current = currentPath();
  const links = user ? NAV[user.role] : [];
  // Highlight the most specific matching link only (/admin/qr should not also light up /admin).
  const active = links.map(([path]) => path).filter((p) => current === p || current.startsWith(`${p}/`)).sort((a, b) => b.length - a.length)[0];
  // replaceChildren turns null into the text "null", so only real nodes are passed.
  nav.replaceChildren(...[
    ...links.map(([path, text]) =>
      h('a', { href: `#${path}`, 'aria-current': path === active ? 'page' : null }, text)),
    user && h('span', { class: 'who' }, `${user.name} (${user.role})`),
    user && h('button', { type: 'button', onclick: signOut }, 'Sign out'),
  ].filter(Boolean));
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
  if (!user && path !== '/login') {
    rememberNext();
    return go('/login');
  }
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
