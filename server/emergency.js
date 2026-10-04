import fs from 'node:fs';
import { authenticate } from './auth.js';

// Public emergency numbers that are safe to ship with the code. The institute's own directory (names and
// personal mobile numbers of doctors, nurses, drivers and staff) is NOT in the repository: it is read from a
// git-ignored file, private/emergency-contacts.json, and only ever sent to signed-in users. See the README.
export const PUBLIC_GROUPS = [{
  group: 'Public emergency services',
  entries: [
    { role: 'National emergency number', name: 'Police, fire and ambulance', phones: ['112'], tags: ['emergency', 'police', 'fire', 'medical'] },
    { role: 'Police Station, Itanagar', name: 'Police Control Room', phones: ['6009909795'], tags: ['emergency', 'police', 'security'] },
    { role: 'Fire Station, Itanagar', name: 'Itanagar Control Room', phones: ['03602212640'], tags: ['emergency', 'fire'] },
  ],
}];

const PHONE = /^\+?[\d][\d\s-]{2,18}$/;
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Reads the private directory and keeps only well-formed entries, so a typo in the file can neither break the
// page nor put anything other than a phone number into a tel: link.
export function loadEmergencyContacts(file) {
  const groups = [...PUBLIC_GROUPS];
  let configured = false;
  if (file && fs.existsSync(file)) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const g of Array.isArray(data.groups) ? data.groups : []) {
        const entries = (Array.isArray(g.entries) ? g.entries : []).map((e) => ({
          role: text(e.role, 80),
          name: text(e.name, 80),
          phones: (Array.isArray(e.phones) ? e.phones : []).filter((p) => typeof p === 'string' && PHONE.test(p.trim())).map((p) => p.trim()),
          tags: (Array.isArray(e.tags) ? e.tags : []).filter((x) => typeof x === 'string').map((x) => x.toLowerCase().slice(0, 20)).slice(0, 8),
        })).filter((e) => e.role || e.name);
        if (entries.length && text(g.group, 80)) groups.push({ group: text(g.group, 80), entries });
      }
      configured = groups.length > PUBLIC_GROUPS.length;
    } catch (err) {
      console.warn(`Could not read the emergency directory (${file}): ${err.message}`);
    }
  }
  return { groups, configured };
}

export function emergencyRoutes(db, router, file) {
  router.get('/emergency', authenticate(db), (_req, res) => {
    res.json(loadEmergencyContacts(file)); // read each time, so editing the file needs no restart
  });
}
