import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, similarity, findDuplicate, MATCH_THRESHOLD } from '../server/dedupe.js';
import { createAssistant, suggestWithRules } from '../server/ai.js';
import { INSTITUTE, latestNotices, parseNotices, resetNoticeCache } from '../server/institute.js';
import { priorityOf } from '../server/priority.js';
import { openDb } from '../server/db.js';

const score = (a, b) => similarity(tokenize(a), tokenize(b));

test('same fault described in different words scores above threshold', () => {
  assert.ok(score('Tube light broken near entrance', 'Light not working in corridor') >= MATCH_THRESHOLD);
  assert.ok(score('Wifi not working', 'Internet is down, router dead') >= MATCH_THRESHOLD);
});

test('unrelated problems stay below threshold', () => {
  assert.ok(score('Tube light broken', 'Fan making loud noise') < MATCH_THRESHOLD);
});

test('findDuplicate requires same category and location', () => {
  const db = openDb(':memory:');
  const now = Date.now();
  db.prepare("INSERT INTO issues (title,category,location,description,department,created_at,updated_at) VALUES ('t','electrical','B-II','Tube light broken','x',?,?)").run(now, now);
  const probe = { category: 'electrical', location: 'B-II', description: 'light not working' };
  assert.equal(findDuplicate(db, probe).length, 1);
  assert.equal(findDuplicate(db, { ...probe, location: 'Central Library' }).length, 0);
  assert.equal(findDuplicate(db, { ...probe, category: 'wifi' }).length, 0);
});

test('findDuplicate ignores resolved issues', () => {
  const db = openDb(':memory:');
  const now = Date.now();
  db.prepare("INSERT INTO issues (title,category,location,description,department,status,created_at,updated_at) VALUES ('t','electrical','B-II','Tube light broken','x','resolved',?,?)").run(now, now);
  assert.equal(findDuplicate(db, { category: 'electrical', location: 'B-II', description: 'light broken' }).length, 0);
});

test('priority rises with duplicate reports and safety keywords', () => {
  const base = { category: 'electrical', description: 'light off', reportCount: 1, createdAt: Date.now(), status: 'open' };
  const plain = priorityOf(base).score;
  assert.ok(priorityOf({ ...base, reportCount: 5 }).score > plain);
  assert.ok(priorityOf({ ...base, description: 'wire sparking' }).score > plain);
});

test('priority escalates with age but not once resolved', () => {
  const now = Date.now();
  const old = { category: 'wifi', description: 'down', reportCount: 1, createdAt: now - 6 * 86_400_000 };
  assert.ok(priorityOf({ ...old, status: 'open' }, now).score > priorityOf({ ...old, status: 'resolved' }, now).score);
});

test('different rooms in the same block never merge; same room or unknown room does', () => {
  const db = openDb(':memory:');
  const now = Date.now();
  db.prepare("INSERT INTO issues (title,category,location,detail,description,department,created_at,updated_at) VALUES ('t','electrical','B-II','CS-101','Tube light broken','x',?,?)").run(now, now);
  const probe = { category: 'electrical', location: 'B-II', description: 'light not working' };
  assert.equal(findDuplicate(db, { ...probe, detail: 'CS-102' }).length, 0);
  assert.equal(findDuplicate(db, { ...probe, detail: 'cs 101' }).length, 1);
  assert.equal(findDuplicate(db, { ...probe, detail: '' }).length, 1);
});

test('floor and room are compared separately, so "Floor 1, 204" still matches "204"', () => {
  const db = openDb(':memory:');
  const now = Date.now();
  db.prepare("INSERT INTO issues (title,category,location,detail,description,department,created_at,updated_at) VALUES ('t','electrical','B-II','Floor 1, 204','Tube light broken','x',?,?)").run(now, now);
  const probe = { category: 'electrical', location: 'B-II', description: 'light not working' };
  assert.equal(findDuplicate(db, { ...probe, detail: '204' }).length, 1);
  assert.equal(findDuplicate(db, { ...probe, detail: 'Floor 1' }).length, 1);
  assert.equal(findDuplicate(db, { ...probe, detail: 'Floor 1, 204' }).length, 1);
  assert.equal(findDuplicate(db, { ...probe, detail: 'Floor 2, 204' }).length, 0);
  assert.equal(findDuplicate(db, { ...probe, detail: 'Floor 1, 205' }).length, 0);
});

test('a reopened issue ranks higher than one that was never reopened', () => {
  const base = { category: 'electrical', description: 'fan stopped', reportCount: 1, createdAt: Date.now(), status: 'open' };
  const reopened = priorityOf({ ...base, reopenCount: 1 });
  assert.ok(reopened.score > priorityOf(base).score);
  assert.ok(reopened.reasons.some((r) => /reopened/.test(r)));
});

test('SLA: overdue after the category deadline, paused while awaiting confirmation, never when resolved', async () => {
  const { slaOf } = await import('../server/priority.js');
  const now = Date.now();
  const hoursAgo = (h) => now - h * 3_600_000;
  assert.equal(slaOf({ category: 'water', createdAt: hoursAgo(23), status: 'open' }, now).overdue, false);
  const late = slaOf({ category: 'water', createdAt: hoursAgo(30), status: 'open' }, now);
  assert.equal(late.overdue, true);
  assert.equal(late.overdue_hours, 6);
  assert.equal(slaOf({ category: 'water', createdAt: hoursAgo(30), status: 'awaiting_confirmation' }, now).overdue, false);
  assert.equal(slaOf({ category: 'water', createdAt: hoursAgo(30), status: 'resolved' }, now).overdue, false);
  assert.equal(slaOf({ category: 'furniture', createdAt: hoursAgo(100), status: 'open' }, now).overdue, false);
});

test('an overdue issue outranks the same issue inside its deadline', () => {
  const now = Date.now();
  const base = { category: 'water', description: 'tap dripping', reportCount: 1, status: 'open' };
  const fresh = priorityOf({ ...base, createdAt: now - 3_600_000 }, now);
  const late = priorityOf({ ...base, createdAt: now - 30 * 3_600_000 }, now);
  assert.ok(late.score >= fresh.score + 20);
  assert.ok(late.reasons.some((r) => /deadline/.test(r)));
});

test('rule-based suggestions pick the category, flag danger and keep the place', () => {
  const cases = [
    ['Wifi router keeps dropping in the lab', 'wifi'],
    ['water leaking from the ceiling pipe', 'water'],
    ['toilet is dirty and smells bad', 'sanitation'],
    ['projector is not working in the seminar hall', 'classroom'],
    ['bench is broken near the stairs', 'furniture'],
    ['something odd happened here today', 'other'],
  ];
  for (const [description, expected] of cases) assert.equal(suggestWithRules({ description }).category, expected, description);

  assert.equal(suggestWithRules({ description: 'Exposed wire sparking near the switch board' }).urgent, true);
  assert.equal(suggestWithRules({ description: 'Light is not working' }).urgent, false);
  assert.equal(suggestWithRules({ description: 'geyser is cold', location: 'Papum' }).category, 'hostel');

  const tidy = suggestWithRules({ description: '  fan   is   dead ', location: 'B-II' });
  assert.equal(tidy.description, 'Fan is dead. Location: B-II.');
  assert.equal(suggestWithRules({ description: 'Fan is dead in B-II', location: 'B-II' }).description, 'Fan is dead in B-II.');
});

test('a local model is used when it answers well and replaced by the rules when it does not', async () => {
  const reply = (body, ok = true) => async () => ({ ok, status: ok ? 200 : 500, json: async () => ({ message: { content: JSON.stringify(body) } }) });
  const good = { category: 'wifi', description: 'Router drops connection.', urgent: false, reason: 'Network fault' };
  const input = { description: 'router keeps dropping in the lab', location: 'B-I' };

  const viaModel = await createAssistant({ model: 'test-model', fetchImpl: reply(good) }).suggest(input);
  assert.equal(viaModel.source, 'local model');
  assert.equal(viaModel.category, 'wifi');

  // An invented category, a server error, and an unreachable server all fall back to the rules.
  for (const fetchImpl of [reply({ ...good, category: 'made-up' }), reply(good, false), async () => { throw new Error('refused'); }]) {
    const out = await createAssistant({ model: 'test-model', fetchImpl }).suggest(input);
    assert.equal(out.source, 'built-in rules');
    assert.equal(out.category, 'wifi');
  }
});

const HOME_HTML = `
  <a href="/notices/older-notice-about-exams/"><span>Jul</span><span>20</span><span>2026</span><h3>Older notice about exams &amp; results</h3></a>
  <a href="/notices/newest-tender-notice/"><div>22 Sep</div></a>
  <a href="/notices/newest-tender-notice/"><span>Sep</span><span>22</span><span>2026</span><p>Newest tender notice for civil work</p></a>
  <a href="/notices/x/"><b>hi</b></a>
  <a href="/events/not-a-notice/">Some event name that is long enough</a>`;

test('notices are read from the official home page, newest first, without duplicates or junk', () => {
  const notices = parseNotices(HOME_HTML);
  assert.deepEqual(notices.map((n) => n.title), ['Newest tender notice for civil work', 'Older notice about exams & results']);
  assert.equal(notices[0].date, '22 Sep 2026');
  assert.equal(notices[0].url, 'https://www.nitap.ac.in/notices/newest-tender-notice/');
  assert.deepEqual(parseNotices('<html>nothing here</html>'), []);
});

test('notices are cached, and a failed fetch never breaks the page', async () => {
  resetNoticeCache();
  const T = 1.8e12; // a realistic timestamp, far from the cache's starting point
  let calls = 0;
  const ok = async () => { calls++; return { ok: true, text: async () => HOME_HTML }; };
  assert.equal((await latestNotices({ fetchImpl: ok, now: T })).length, 2);
  await latestNotices({ fetchImpl: ok, now: T + 60_000 });
  assert.equal(calls, 1);

  // After the cache expires a failure keeps the previous list instead of throwing.
  const down = async () => { throw new Error('offline'); };
  assert.equal((await latestNotices({ fetchImpl: down, now: T + 2 * 3_600_000 })).length, 2);

  resetNoticeCache();
  assert.deepEqual(await latestNotices({ fetchImpl: down, now: T + 9_000_000 }), []);
  resetNoticeCache();
});

test('institute facts carry their sources and retrieval date', () => {
  assert.equal(INSTITUTE.mission.length, 5);
  assert.match(INSTITUTE.address, /791113/);
  assert.ok(INSTITUTE.sources.every((x) => x.url.startsWith('https://www.nitap.ac.in/')));
  assert.match(INSTITUTE.retrieved, /^\d{4}-\d{2}-\d{2}$/);
});
