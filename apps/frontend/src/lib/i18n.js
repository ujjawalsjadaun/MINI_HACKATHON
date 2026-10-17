import { useSyncExternalStore } from 'react';
import hi from '../i18n/lang/hi.js';
import as from '../i18n/lang/as.js';
import bn from '../i18n/lang/bn.js';
import odia from '../i18n/lang/or.js';

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
  const preferred = (globalThis.navigator?.language ?? 'en').slice(0, 2);
  return DICTIONARIES[preferred] ? preferred : 'en';
}

let current = initial();
if (typeof document !== 'undefined') document.documentElement.lang = current;
const listeners = new Set();

export const currentLanguage = () => current;
export const currentLocale = () => LANGUAGES.find((l) => l.code === current).locale;

export function t(text, params) {
  const out = DICTIONARIES[current][text] ?? text;
  return params ? out.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`) : out;
}

export function setLanguage(code) {
  if (!DICTIONARIES[code] || code === current) return;
  current = code;
  try { localStorage.setItem(KEY, code); } catch { /* the choice just will not be remembered */ }
  document.documentElement.lang = code;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };

// Components call this to get `t` and to re-render when the language changes.
export function useI18n() {
  const language = useSyncExternalStore(subscribe, currentLanguage);
  return { t, language, locale: currentLocale(), setLanguage };
}
