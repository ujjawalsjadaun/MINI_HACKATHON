import { t } from './i18n.js';

const TOKEN_KEY = 'campusfix.token';

export const tokenStore = {
  get() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(value) {
    try {
      if (value) localStorage.setItem(TOKEN_KEY, value);
      else localStorage.removeItem(TOKEN_KEY);
    } catch { /* storage unavailable: the session lasts until reload */ }
  },
};

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Talks to the backend. Errors carry a message already translated into the reader's language.
export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const token = tokenStore.get();
  if (token) headers.authorization = `Bearer ${token}`;
  if (body) headers['content-type'] = 'application/json';

  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: form ?? (body && JSON.stringify(body)) });
  } catch {
    throw new ApiError(0, t('Cannot reach the server. Check your connection and try again.'));
  }
  const data = res.status === 204 ? null : await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) window.dispatchEvent(new Event('auth:expired'));
    throw new ApiError(res.status, t(data?.error ?? 'Request failed'));
  }
  return data;
}

// Data that rarely changes is fetched once and shared by every page.
let metaPromise;
export const getMeta = () => (metaPromise ??= api('/meta').catch((err) => { metaPromise = undefined; throw err; }));

export const getEmergency = () => api('/emergency').catch(() => ({ groups: [], configured: false }));
