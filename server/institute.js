// Facts about the host institute, taken from its official website (https://www.nitap.ac.in).
// The static part was copied from the pages listed in `sources` on RETRIEVED. The notices are fetched live
// (and cached) so they stay current. This is information about the institute, not a claim that CampusFix is official.

const SITE = 'https://www.nitap.ac.in';
export const RETRIEVED = '2026-10-04';

export const INSTITUTE = {
  name: 'National Institute of Technology Arunachal Pradesh',
  short: 'NIT Arunachal Pradesh',
  status: 'Institute of National Importance under the Ministry of Education, Government of India',
  established: 'Established in 2010 and inaugurated on 18 August 2010',
  campus: 'Permanent campus at Jote, about 30 km from Itanagar. It began at a temporary campus in Yupia.',
  address: 'Jote, District Papum Pare, Arunachal Pradesh, India - 791113',
  phone: '+91 0360-2954549',
  website: 'www.nitap.ac.in',
  vision: 'To transform into an acclaimed institution of higher learning with creation of an impact on the north eastern region in terms of innovation and entrepreneurship.',
  mission: [
    'To generate new knowledge through state of the art academic program and research in multidisciplinary field.',
    'To identify regional, Indian and global need to serve the society better.',
    'To create an ambience to flourish new ideas, research and academic excellence to produce new leaders and innovators.',
    'To collaborate with other academic, research institutes and industries for wholistic growth of the students.',
    'Utilization of available big resources to encourage entrepreneurship through formation of startups.',
  ],
  sources: [
    { label: 'Home page', url: `${SITE}/` },
    { label: 'Vision', url: `${SITE}/institute/vision/` },
    { label: 'Mission', url: `${SITE}/institute/mission/` },
    { label: 'Establishment', url: `${SITE}/institute/establishment/` },
    { label: 'Hostel admission instructions 2026-27', url: `${SITE}/notices/instruction-for-new-hostel-admission-2026-27/` },
  ],
  retrieved: RETRIEVED,
};

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#160;|&nbsp;/g, ' ');

// Reads the "Notice Board" links out of the home page HTML. Anything unexpected yields fewer or no notices,
// never an error: the card simply does not show.
export function parseNotices(html, limit = 5) {
  const notices = new Map();
  for (const m of html.matchAll(/<a[^>]*href="(\/notices\/[a-z0-9-]+\/)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const pieces = decode(m[2].replace(/<[^>]+>/g, '\n')).split('\n').map((p) => p.trim()).filter(Boolean);
    const title = pieces.reduce((a, b) => (b.length > a.length ? b : a), '');
    if (title.length < 8) continue;
    const date = pieces.join(' ').match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{1,2}),? (20\d\d)\b/i);
    const known = notices.get(m[1]);
    // The same notice is linked twice; keep the entry that has a full date.
    if (!known || (!known.date && date)) notices.set(m[1], { title: title.slice(0, 200), url: SITE + m[1], date: date ? `${date[2]} ${date[1]} ${date[3]}` : known?.date ?? null });
  }
  const time = (n) => Date.parse(n.date ?? '') || 0;
  return [...notices.values()].sort((a, b) => time(b) - time(a)).slice(0, limit);
}

const CACHE_MS = 60 * 60 * 1000;
let cache = { at: 0, notices: [] };

export async function latestNotices({ fetchImpl = fetch, now = Date.now() } = {}) {
  if (now - cache.at < CACHE_MS) return cache.notices;
  try {
    const res = await fetchImpl(`${SITE}/`, { signal: AbortSignal.timeout(6000), headers: { 'user-agent': 'CampusFix-student-project' } });
    if (!res.ok) throw new Error(`status ${res.status}`);
    cache = { at: now, notices: parseNotices(await res.text()) };
  } catch (err) {
    console.warn(`Could not fetch notices from ${SITE}: ${err.message}`);
    cache = { at: now - CACHE_MS + 5 * 60 * 1000, notices: cache.notices }; // retry in 5 minutes, keep any older list
  }
  return cache.notices;
}

export function resetNoticeCache() {
  cache = { at: 0, notices: [] };
}
