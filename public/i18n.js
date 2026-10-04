import hi from './lang/hi.js';
import as from './lang/as.js';
import bn from './lang/bn.js';
import odia from './lang/or.js';

// The English text in the code is the key. A missing translation falls back to that English text, so a
// forgotten string shows up in English instead of breaking the page. `{name}` placeholders are filled from params.
export const LANGUAGES = [
  { code: 'en', label: 'English', locale: 'en-IN' },
  { code: 'hi', label: 'हिन्दी', locale: 'hi-IN' },
  { code: 'as', label: 'অসমীয়া', locale: 'as-IN' },
  { code: 'bn', label: 'বাংলা', locale: 'bn-IN' },
  { code: 'or', label: 'ଓଡ଼ିଆ', locale: 'or-IN' },
];
const DICTIONARIES = { en: {}, hi, as, bn, or: odia };
const KEY = 'campusfix.lang';

function initial() {
  try {
    const saved = localStorage.getItem(KEY);
    if (DICTIONARIES[saved]) return saved;
  } catch { /* storage unavailable */ }
  const preferred = (navigator.language ?? 'en').slice(0, 2);
  return DICTIONARIES[preferred] ? preferred : 'en';
}

let current = initial();
document.documentElement.lang = current;

export const currentLanguage = () => current;
export const currentLocale = () => LANGUAGES.find((l) => l.code === current).locale;

export function t(text, params) {
  const out = DICTIONARIES[current][text] ?? text;
  return params ? out.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`) : out;
}

// Static page text is marked in the HTML with data-i18n="<English text>" (and data-i18n-aria for aria-label).
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
}

export function setLanguage(code) {
  if (!DICTIONARIES[code] || code === current) return;
  current = code;
  try { localStorage.setItem(KEY, code); } catch { /* the choice just will not be remembered */ }
  document.documentElement.lang = code;
  applyStatic();
  window.dispatchEvent(new Event('lang:changed'));
}

applyStatic();
