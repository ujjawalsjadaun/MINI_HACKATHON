import { currentLocale, t } from './i18n.js';

// Tiny DOM builder. Text always goes through textContent, so user-submitted
// descriptions can never inject markup.
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else if (key === 'value') el.value = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function toast(message, kind = 'info') {
  const el = h('div', { class: `toast ${kind === 'error' ? 'error' : ''}` }, message);
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), 4500);
}

export const formatDate = (ms) =>
  new Date(ms).toLocaleString(currentLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const label = (text) => text.replace(/_/g, ' ');

export function badge(text, cls) {
  return h('span', { class: `badge ${cls}` }, t(label(text)));
}
