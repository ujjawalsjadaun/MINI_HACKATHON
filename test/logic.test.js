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
  db.prepare("INSERT INTO issues (title,category,location,description,department,created_at,updated_at) VALUES ('t','electrical','CS Block','Tube light broken','x',?,?)").run(now, now);
  const probe = { category: 'electrical', location: 'CS Block', description: 'light not working' };
  assert.equal(findDuplicate(db, probe).length, 1);
  assert.equal(findDuplicate(db, { ...probe, location: 'Library' }).length, 0);
  assert.equal(findDuplicate(db, { ...probe, category: 'wifi' }).length, 0);
});

test('findDuplicate ignores resolved issues', () => {
  const db = openDb(':memory:');
  const now = Date.now();
  db.prepare("INSERT INTO issues (title,category,location,description,department,status,created_at,updated_at) VALUES ('t','electrical','CS Block','Tube light broken','x','resolved',?,?)").run(now, now);
  assert.equal(findDuplicate(db, { category: 'electrical', location: 'CS Block', description: 'light broken' }).length, 0);
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
