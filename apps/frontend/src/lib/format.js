export const formatDate = (ms, locale) =>
  new Date(ms).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const label = (text) => text.replace(/_/g, ' ');
