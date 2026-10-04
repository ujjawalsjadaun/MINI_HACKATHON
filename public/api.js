import { t } from './i18n.js';

const TOKEN_KEY = 'campusfix.token';

export const session = {
  user: null,
  get token() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set token(value) {
    try {
      if (value) localStorage.setItem(TOKEN_KEY, value);
      else localStorage.removeItem(TOKEN_KEY);
    } catch { /* storage unavailable: session lasts until reload */ }
  },
};

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (session.token) headers.authorization = `Bearer ${session.token}`;
  if (body) headers['content-type'] = 'application/json';

  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: form ?? (body && JSON.stringify(body)) });
  } catch {
    throw new ApiError(0, t('Cannot reach the server. Check your connection and try again.'));
  }
  const data = res.status === 204 ? null : await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && session.token) window.dispatchEvent(new Event('auth:expired'));
    throw new ApiError(res.status, t(data?.error ?? 'Request failed'));
  }
  return data;
}
