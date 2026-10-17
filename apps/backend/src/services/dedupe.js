import { ACTIVE_STATUSES } from '../config/constants.js';
import { Issue, Report } from '../models/index.js';

const STOP = new Set([
  'the', 'and', 'for', 'are', 'was', 'has', 'have', 'not', 'this', 'that', 'with', 'from', 'near',
  'since', 'again', 'there', 'its', 'but', 'please', 'very', 'some', 'room', 'floor', 'one',
]);

// Students describe the same fault in different words; map them to one concept.
const SYNONYMS = {
  broken: 'fault', damaged: 'fault', dead: 'fault', faulty: 'fault', fused: 'fault',
  fuse: 'fault', stopped: 'fault', working: 'fault', work: 'fault', burnt: 'fault',
  leaking: 'leak', leakage: 'leak', leaks: 'leak', dripping: 'leak', seepage: 'leak',
  internet: 'wifi', network: 'wifi', wi: 'wifi', fi: 'wifi', router: 'wifi',
  tubelight: 'light', bulb: 'light', lights: 'light', lamp: 'light', tube: 'light',
  fans: 'fan', toilets: 'toilet', washroom: 'toilet', bathroom: 'toilet',
  dirty: 'unclean', garbage: 'unclean', trash: 'unclean', smell: 'unclean',
  projector: 'projector', mic: 'microphone',
};

export function tokenize(text = '') {
  const out = new Set();
  for (const raw of text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)) {
    if (raw.length < 2 || STOP.has(raw)) continue;
    const word = SYNONYMS[raw] ?? raw;
    if (word === 'fault' && out.has('fault')) continue;
    out.add(word);
  }
  return out;
}

// Overlap coefficient: robust when one report is much shorter than the other.
export function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / Math.min(a.size, b.size);
}

export const MATCH_THRESHOLD = 0.34;

// "CS-101", "cs 101" and "CS101" are the same room.
export const normalizeRoom = (text = '') => text.toLowerCase().replace(/[^a-z0-9]/g, '');

// The report form writes "Floor 2, 204" or "Ground floor, 204": split that into a floor and a room.
export function parseDetail(text = '') {
  const m = /^\s*(ground floor|floor\s*\d+)\s*(?:,\s*)?(.*)$/i.exec(text);
  return m ? { floor: normalizeRoom(m[1]), room: normalizeRoom(m[2]) } : { floor: '', room: normalizeRoom(text) };
}

// Two reports that name a different floor or a different room are different problems, even in the same
// block. A missing floor or room is unknown, so it never blocks a match.
export const sameRoomOrUnknown = (a, b) => {
  const [x, y] = [parseDetail(a), parseDetail(b)];
  return (!x.floor || !y.floor || x.floor === y.floor) && (!x.room || !y.room || x.room === y.room);
};

// Candidates must share category and location, and not name a different room (hard constraints). Text similarity
// against the issue and all its merged reports then decides whether it is the same problem.
export async function findDuplicate({ category, location, detail = '', description }) {
  const candidates = (await Issue.find({ category, location, status: { $in: ACTIVE_STATUSES } })
    .select('id title description detail -_id').lean())
    .filter((issue) => sameRoomOrUnknown(issue.detail, detail));

  const incoming = tokenize(`${description} ${detail}`);
  const reportsByIssue = await reportTextsOf(candidates.map((i) => i.id));

  const scored = candidates.map((issue) => {
    const known = tokenize(`${issue.description} ${issue.detail}`);
    for (const text of reportsByIssue.get(issue.id) ?? []) for (const t of tokenize(text)) known.add(t);
    return { issue, score: similarity(incoming, known) };
  });

  return scored.filter((s) => s.score >= MATCH_THRESHOLD).sort((a, b) => b.score - a.score);
}

// The wording of every report merged into each of the given issues: issue id -> list of descriptions.
export async function reportTextsOf(issueIds) {
  const byIssue = new Map();
  if (!issueIds.length) return byIssue;
  for (const r of await Report.find({ issue_id: { $in: issueIds } }).select('issue_id description -_id').lean()) {
    byIssue.set(r.issue_id, [...(byIssue.get(r.issue_id) ?? []), r.description]);
  }
  return byIssue;
}

export function explainMatch(category, location, score) {
  return `Same category and location (${location}); ${Math.round(score * 100)}% wording overlap`;
}
