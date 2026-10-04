import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, similarity, findDuplicate, MATCH_THRESHOLD } from '../server/dedupe.js';
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
