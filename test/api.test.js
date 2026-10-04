import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { createUser } from '../server/auth.js';
import { openDb } from '../server/db.js';

let server, base, uploadDir;
const db = openDb(':memory:');

before(async () => {
  uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campusfix-'));
  createUser(db, { name: 'Admin', email: 'admin@test.edu', password: 'adminpass', role: 'admin' });
  server = createApp(db, { uploadDir }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(uploadDir, { recursive: true, force: true });
});

async function call(method, url, { token, body, form } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: {
      ...(token && { authorization: `Bearer ${token}` }),
      ...(body && { 'content-type': 'application/json' }),
    },
    body: form ?? (body && JSON.stringify(body)),
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

async function signup(name) {
  const { data } = await call('POST', '/api/auth/register', {
    body: { name, email: `${name.toLowerCase()}@test.edu`, password: 'secret123' },
  });
  return data.token;
}

const report = (token, description, extra = {}) => {
  const form = new FormData();
  const fields = { category: 'electrical', location: 'CS Block', description, ...extra };
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return call('POST', '/api/issues', { token, form });
};

test('protected routes reject anonymous users', async () => {
  assert.equal((await call('GET', '/api/issues')).status, 401);
});

test('registration validates input and rejects duplicate emails', async () => {
  const bad = await call('POST', '/api/auth/register', { body: { name: 'A', email: 'nope', password: '1' } });
  assert.equal(bad.status, 400);
  await signup('Dup');
  const again = await call('POST', '/api/auth/register', { body: { name: 'Dup', email: 'dup@test.edu', password: 'secret123' } });
  assert.equal(again.status, 409);
});

test('three students reporting the same broken light become one issue', async () => {
  const [a, b, c] = await Promise.all(['Asha', 'Bimal', 'Chen'].map(signup));
  const first = await report(a, 'Tube light broken near the entrance');
  assert.equal(first.status, 201);
  assert.equal(first.data.merged, false);

  const second = await report(b, 'Light not working in the corridor');
  assert.equal(second.status, 200);
  assert.equal(second.data.merged, true);
  assert.equal(second.data.issueId, first.data.issueId);
  assert.match(second.data.reason, /CS Block/);

  const me = await call('POST', `/api/issues/${first.data.issueId}/me-too`, { token: c });
  assert.equal(me.status, 201);

  const { data: issues } = await call('GET', '/api/issues?status=active', { token: a });
  const issue = issues.find((i) => i.id === first.data.issueId);
  assert.equal(issue.report_count, 3);
});

test('a student cannot report the same issue twice', async () => {
  const d = await signup('Dev');
  const first = await report(d, 'Ceiling fan not working at all', { category: 'electrical', location: 'Library' });
  const repeat = await report(d, 'Fan is broken and not working', { category: 'electrical', location: 'Library' });
  assert.equal(first.status, 201);
  assert.equal(repeat.status, 409);
});

test('different location creates a separate issue', async () => {
  const e = await signup('Esha');
  const res = await report(e, 'Tube light broken near the entrance', { location: 'Library' });
  assert.equal(res.data.merged, false);
});

test('similar-issue check warns before submitting', async () => {
  const f = await signup('Farid');
  const { data } = await call('POST', '/api/issues/similar', {
    token: f, body: { category: 'electrical', location: 'CS Block', description: 'light is not working' },
  });
  assert.ok(data.length >= 1);
  assert.ok(data[0].report_count >= 3);
});

test('report validation rejects bad category, location and short text', async () => {
  const g = await signup('Gita');
  assert.equal((await report(g, 'short')).status, 400);
  assert.equal((await report(g, 'A long enough description', { category: 'bogus' })).status, 400);
  assert.equal((await report(g, 'A long enough description', { location: 'Moon' })).status, 400);
});

test('photo upload accepts images and rejects other files', async () => {
  const h = await signup('Hari');
  const good = new FormData();
  good.append('category', 'wifi');
  good.append('location', 'Boys Hostel');
  good.append('description', 'Wifi router is dead on this floor');
  good.append('photo', new Blob([Buffer.from([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }), 'p.jpg');
  const ok = await call('POST', '/api/issues', { token: h, form: good });
  assert.equal(ok.status, 201);
  const { data } = await call('GET', `/api/issues/${ok.data.issueId}`, { token: h });
  assert.match(data.reports[0].photo, /^\/uploads\/.+\.jpg$/);

  const bad = new FormData();
  bad.append('category', 'wifi');
  bad.append('location', 'Library');
  bad.append('description', 'Wifi is down in the whole library');
  bad.append('photo', new Blob(['<script>'], { type: 'text/html' }), 'x.html');
  assert.equal((await call('POST', '/api/issues', { token: h, form: bad })).status, 400);
});

test('students only see their own report details; reporter names stay hidden', async () => {
  const i = await signup('Isha');
  const { data: issues } = await call('GET', '/api/issues?status=active', { token: i });
  const detail = await call('GET', `/api/issues/${issues[0].id}`, { token: i });
  assert.equal(detail.data.reports.length, 0);
});

test('only admins can update issues; updates land on the student-visible timeline', async () => {
  const student = await signup('Jai');
  const { data: admin } = await call('POST', '/api/auth/login', { body: { email: 'admin@test.edu', password: 'adminpass' } });
  const created = await report(student, 'Water leaking from the ceiling', { category: 'water', location: 'Admin Block' });
  const id = created.data.issueId;

  assert.equal((await call('PATCH', `/api/issues/${id}`, { token: student, body: { status: 'resolved' } })).status, 403);
  assert.equal((await call('PATCH', `/api/issues/${id}`, { token: admin.token, body: { status: 'bogus' } })).status, 400);

  const assigned = await call('PATCH', `/api/issues/${id}`, { token: admin.token, body: { assigned_to: 'Ramesh (plumber)' } });
  assert.equal(assigned.data.issue.status, 'assigned');
  const done = await call('PATCH', `/api/issues/${id}`, { token: admin.token, body: { status: 'resolved', note: 'Pipe replaced' } });
  assert.equal(done.data.issue.status, 'resolved');
  assert.ok(done.data.issue.resolved_at);

  const { data } = await call('GET', `/api/issues/${id}`, { token: student });
  assert.deepEqual(data.log.map((l) => l.status), ['open', 'assigned', 'resolved']);
  assert.match(data.log.at(-1).note, /Pipe replaced/);
});
