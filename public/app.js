import { api, session } from './api.js';
import { h, toast } from './dom.js';
import { LANGUAGES, currentLanguage, setLanguage, t } from './i18n.js';
import { currentPath, go, homeFor, matchRoute, rememberNext } from './router.js';
import { authView, forgotView } from './views/auth.js';
import './views/admin.js';
import './views/qr.js';
import './views/insights.js';
import './views/issues.js';
import './views/map.js';
import './views/report.js';
import './views/security.js';

const main = document.getElementById('main');
const nav = document.getElementById('nav');

// Reachable without signing in.
const PUBLIC_PATHS = new Set(['/login', '/forgot']);

const NAV = {
  admin: [['/admin', 'Issues'], ['/map', 'Map'], ['/insights', 'Insights'], ['/admin/qr', 'QR tags']],
  staff: [['/admin', 'My assignments'], ['/map', 'Map'], ['/security', 'Security']],
  student: [['/report', 'Report issue'], ['/mine', 'My complaints'], ['/feed', 'Campus feed'], ['/map', 'Map'], ['/security', 'Security']],
};

function renderNav() {
  const user = session.user;
  const current = currentPath();
  const links = user ? NAV[user.role] : [];
  // Highlight the most specific matching link only (/admin/qr should not also light up /admin).
  const active = links.map(([path]) => path).filter((p) => current === p || current.startsWith(`${p}/`)).sort((a, b) => b.length - a.length)[0];
  // replaceChildren turns null into the text "null", so only real nodes are passed.
  const language = h('select', { class: `lang${user ? '' : ' push'}`, 'aria-label': t('Language'), onchange: (e) => setLanguage(e.target.value) },
    LANGUAGES.map((l) => h('option', { value: l.code, selected: l.code === currentLanguage() ? true : null }, l.label)));
  nav.replaceChildren(...[
    ...links.map(([path, text]) =>
      h('a', { href: `#${path}`, 'aria-current': path === active ? 'page' : null }, t(text))),
    user && h('span', { class: 'who' }, `${user.name} (${t(user.role)})`),
    language,
    user && h('button', { type: 'button', onclick: signOut }, t('Sign out')),
  ].filter(Boolean));
}

async function signOut() {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* token may already be invalid */ }
  session.token = null;
  session.user = null;
  go('/login');
}

function showError(err) {
  main.replaceChildren(h('div', { class: 'card' }, h('h1', {}, t('Something went wrong')), h('p', { class: 'error' }, err.message)));
}

async function render() {
  const path = currentPath();
  const user = session.user;
  if (!user && !PUBLIC_PATHS.has(path)) {
    rememberNext();
    return go('/login');
  }
  if (user && (PUBLIC_PATHS.has(path) || path === '/')) return go(homeFor(user));

  renderNav();
  if (path === '/login') return main.replaceChildren(authView());
  if (path === '/forgot') return main.replaceChildren(forgotView());

  const found = matchRoute(path);
  if (!found) return main.replaceChildren(h('div', { class: 'card' }, h('h1', {}, t('Page not found'))));
  if (!found.route.roles.includes(user.role)) return go(homeFor(user));

  main.replaceChildren(h('p', { class: 'muted' }, t('Loading...')));
  try {
    const page = await found.route.render(found.params);
    // Accounts without a security question could not reset a forgotten password, so say so.
    const needsQuestion = user.role !== 'admin' && !user.security_set && path !== '/security';
    main.replaceChildren(...[
      needsQuestion && h('div', { class: 'notice' }, h('strong', {}, t('Protect your account. ')), t('Set a security question so you can reset your password if you forget it. '), h('a', { href: '#/security' }, t('Set it now'))),
      page,
    ].filter(Boolean));
    main.focus({ preventScroll: true });
  } catch (err) {
    showError(err);
  }
}

window.addEventListener('hashchange', render);
window.addEventListener('lang:changed', render);
window.addEventListener('auth:expired', () => {
  session.token = null;
  session.user = null;
  toast(t('Your session expired. Please sign in again.'), 'error');
  go('/login');
});

(async function boot() {
  if (session.token) {
    try { session.user = await api('/me'); } catch { session.token = null; }
  }
  render();
})();
