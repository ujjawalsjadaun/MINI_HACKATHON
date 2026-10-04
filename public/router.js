import { session } from './api.js';

// Route table: pattern -> { roles allowed, render(params) returning a DOM node }.
// Kept separate from app.js so views can register themselves without import cycles.
export const routes = [];

export function route(pattern, roles, render) {
  routes.push({ pattern, roles, render });
}

export function go(path) {
  if (location.hash === `#${path}`) window.dispatchEvent(new Event('hashchange'));
  else location.hash = path;
}

// Hash path without its query string, e.g. '#/admin?status=open' -> '/admin'.
export const currentPath = () => (location.hash.slice(1) || '/').split('?')[0];

export const homeFor = (user) => (user.role === 'student' ? '/report' : '/admin');

// A QR scan while signed out must survive the sign-in step.
const NEXT_KEY = 'campusfix.next';
export function rememberNext() {
  try { sessionStorage.setItem(NEXT_KEY, location.hash.slice(1)); } catch { /* storage unavailable */ }
}
function takeNext() {
  try {
    const next = sessionStorage.getItem(NEXT_KEY);
    sessionStorage.removeItem(NEXT_KEY);
    return next && next !== '/login' ? next : null;
  } catch { return null; }
}

export function startSession({ token, user }) {
  session.token = token;
  session.user = user;
  go(takeNext() ?? homeFor(user));
}

export function matchRoute(path) {
  for (const r of routes) {
    const m = path.match(new RegExp(`^${r.pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`));
    if (m) return { route: r, params: m.groups ?? {} };
  }
  return null;
}
