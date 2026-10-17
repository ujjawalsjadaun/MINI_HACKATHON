import { t } from './i18n.js';

// The server writes its score breakdown, timeline notes and match explanations in English with numbers and names
// built in. These helpers recognise each pattern and translate it; anything else is shown as it was written.
const match = (text, pattern) => pattern.exec(text);

export function priorityReason(reason) {
  let m;
  if ((m = match(reason, /^category severity \+(\d+)$/))) return t('category severity +{n}', { n: m[1] });
  if ((m = match(reason, /^(\d+) reports \+(\d+)$/))) return t('{count} reports +{n}', { count: m[1], n: m[2] });
  if ((m = match(reason, /^reporter marked it (\w+) \+(\d+)$/))) return t('reporter marked it {level} +{n}', { level: t(m[1]), n: m[2] });
  if ((m = match(reason, /^safety keywords \+(\d+)$/))) return t('safety keywords +{n}', { n: m[1] });
  if ((m = match(reason, /^reopened after a claimed fix \+(\d+)$/))) return t('reopened after a claimed fix +{n}', { n: m[1] });
  if ((m = match(reason, /^past the (\d+)h deadline \+(\d+)$/))) return t('past the {hours}h deadline +{n}', { hours: m[1], n: m[2] });
  if ((m = match(reason, /^unresolved for days \+(\d+)$/))) return t('unresolved for days +{n}', { n: m[1] });
  return reason;
}

export function noteText(note) {
  let m;
  if ((m = match(note, /^Reported and routed to (.+)$/))) return t('Reported and routed to {dept}', { dept: t(m[1]) });
  if ((m = match(note, /^Reopened: ([\s\S]+)$/))) return t('Reopened: {note}', { note: t(m[1]) });
  if ((m = match(note, /^Assigned to (.+?)(?: - ([\s\S]*))?$/))) return t('Assigned to {name}', { name: m[1] }) + (m[2] ? ` - ${t(m[2])}` : '');
  if ((m = match(note, /^Unassigned(?: - ([\s\S]*))?$/))) return t('Unassigned') + (m[1] ? ` - ${t(m[1])}` : '');
  if ((m = match(note, /^Same category and location \((.+)\); (\d+)% wording overlap$/))) return t('Same category and location ({place}); {pct}% wording overlap', { place: m[1], pct: m[2] });
  return t(note);
}

export const categoryLabel = (meta, key) => t(meta.categories.find((c) => c.key === key)?.label ?? key);

// ---- Emergency directory helpers (the names and numbers come from the server)
export const phoneHref = (phone) => `tel:${phone.replace(/[^\d+]/g, '')}`;

// Entries of the directory carrying at least one of the given tags, with a number to call.
export function contactsWith(directory, tags) {
  const wanted = new Set(tags);
  return directory.groups.flatMap((g) => g.entries).filter((e) => e.phones.length && e.tags.some((x) => wanted.has(x)));
}

// Which kinds of help fit a situation: building problems call the engineering cell, hostel problems the hostel
// office, and an emergency anything tagged as such (doctors, ambulance, security, police and fire).
export function helpTags({ category, hostel, emergency }) {
  const tags = [];
  if (emergency) tags.push('emergency');
  if (['electrical', 'water', 'furniture'].includes(category)) tags.push('engineering');
  if (hostel || category === 'hostel') tags.push('hostel');
  return tags;
}

export const isHostelPlace = (meta, place) => meta.campus.some((g) => g.group === 'Hostels' && g.places.some((p) => p.name === place));
