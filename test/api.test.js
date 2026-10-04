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

const tokens = {};
async function signup(name) {
  const { data } = await call('POST', '/api/auth/register', {
    body: { name, email: `${name.toLowerCase()}@test.edu`, password: 'secret123' },
  });
  tokens[name] = data.token;
  return data.token;
}

const makeStaff = (name, department) =>
  createUser(db, { name, email: `${name.toLowerCase()}@test.edu`, password: 'staffpass', role: 'staff', department });
const staffLogin = async (name) =>
  (await call('POST', '/api/auth/login', { body: { email: `${name.toLowerCase()}@test.edu`, password: 'staffpass' } })).data.token;

const adminLogin = async () =>
  (await call('POST', '/api/auth/login', { body: { email: 'admin@test.edu', password: 'adminpass' } })).data.token;

// The only way to close an issue: the team marks it fixed, then a reporter confirms.
async function resolveIssue(adminToken, issueId, reporterToken) {
  await call('PATCH', `/api/issues/${issueId}`, { token: adminToken, body: { status: 'awaiting_confirmation' } });
  await call('POST', `/api/issues/${issueId}/confirm`, { token: reporterToken });
}

const report = (token, description, extra = {}) => {
  const form = new FormData();
  const fields = { category: 'electrical', location: 'B-II', description, ...extra };
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
  assert.match(second.data.reason, /B-II/);

  const me = await call('POST', `/api/issues/${first.data.issueId}/me-too`, { token: c });
  assert.equal(me.status, 201);

  const { data: issues } = await call('GET', '/api/issues?status=active', { token: a });
  const issue = issues.find((i) => i.id === first.data.issueId);
  assert.equal(issue.report_count, 3);
});

test('a student cannot report the same issue twice', async () => {
  const d = await signup('Dev');
  const first = await report(d, 'Ceiling fan not working at all', { category: 'electrical', location: 'Central Library' });
  const repeat = await report(d, 'Fan is broken and not working', { category: 'electrical', location: 'Central Library' });
  assert.equal(first.status, 201);
  assert.equal(repeat.status, 409);
});

test('different location creates a separate issue', async () => {
  const e = await signup('Esha');
  const res = await report(e, 'Tube light broken near the entrance', { location: 'Central Library' });
  assert.equal(res.data.merged, false);
});

test('similar-issue check warns before submitting', async () => {
  const f = await signup('Farid');
  const query = new URLSearchParams({ location: 'B-II', category: 'electrical', description: 'light is not working' });
  const { data } = await call('GET', `/api/issues/nearby?${query}`, { token: f });
  assert.ok(data.length >= 1);
  assert.ok(data[0].report_count >= 3);
  assert.equal(data[0].likely, true);

  // Only a location is needed: other categories at the place are listed but not "likely".
  const bare = await call('GET', '/api/issues/nearby?location=B-II', { token: f });
  assert.ok(bare.data.length >= 1);
  assert.ok(bare.data.every((i) => i.likely === false));
  assert.equal((await call('GET', '/api/issues/nearby?location=Moon', { token: f })).status, 400);
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
  good.append('location', 'Lohit-1');
  good.append('description', 'Wifi router is dead on this floor');
  good.append('photo', new Blob([Buffer.from([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }), 'p.jpg');
  const ok = await call('POST', '/api/issues', { token: h, form: good });
  assert.equal(ok.status, 201);
  const { data } = await call('GET', `/api/issues/${ok.data.issueId}`, { token: h });
  assert.match(data.reports[0].photo, /^\/uploads\/.+\.jpg$/);

  const bad = new FormData();
  bad.append('category', 'wifi');
  bad.append('location', 'Central Library');
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
  const created = await report(student, 'Water leaking from the ceiling', { category: 'water', location: 'Administrative Building' });
  const id = created.data.issueId;

  assert.equal((await call('PATCH', `/api/issues/${id}`, { token: student, body: { status: 'resolved' } })).status, 403);
  assert.equal((await call('PATCH', `/api/issues/${id}`, { token: admin.token, body: { status: 'bogus' } })).status, 400);

  const staffId = makeStaff('Suresh', 'Civil & Plumbing');
  assert.equal((await call('PATCH', `/api/issues/${id}`, { token: admin.token, body: { assignee_id: 999 } })).status, 400);
  const assigned = await call('PATCH', `/api/issues/${id}`, { token: admin.token, body: { assignee_id: staffId } });
  assert.equal(assigned.data.issue.status, 'assigned');
  assert.equal(assigned.data.issue.assigned_to, 'Suresh');
  // The team cannot close it themselves.
  assert.equal((await call('PATCH', `/api/issues/${id}`, { token: admin.token, body: { status: 'resolved' } })).status, 400);
  const fixed = await call('PATCH', `/api/issues/${id}`, { token: admin.token, body: { status: 'awaiting_confirmation', note: 'Pipe replaced' } });
  assert.equal(fixed.data.issue.status, 'awaiting_confirmation');

  const seen = await call('GET', `/api/issues/${id}`, { token: student });
  assert.equal(seen.data.can_confirm, true);
  assert.equal((await call('POST', `/api/issues/${id}/confirm`, { token: student })).status, 200);

  const { data } = await call('GET', `/api/issues/${id}`, { token: student });
  assert.equal(data.issue.status, 'resolved');
  assert.ok(data.issue.resolved_at);
  assert.deepEqual(data.log.map((l) => l.status), ['open', 'assigned', 'awaiting_confirmation', 'resolved']);
  assert.match(data.log[2].note, /Pipe replaced/);
});

test('insights are admin-only and report merged duplicates and recurring problems', async () => {
  const student = await signup('Kiran');
  assert.equal((await call('GET', '/api/insights', { token: student })).status, 403);

  const { data: admin } = await call('POST', '/api/auth/login', { body: { email: 'admin@test.edu', password: 'adminpass' } });
  // A second electrical issue at B-II, after the first is resolved, marks the spot as recurring.
  const { data: issues } = await call('GET', '/api/issues?location=B-II&category=electrical', { token: admin.token });
  await resolveIssue(admin.token, issues[0].id, tokens.Asha);
  const again = await report(student, 'Tube light broken near the entrance', { location: 'B-II' });
  assert.equal(again.data.merged, false);
  // A third, unrelated electrical fault in another room: 3 in 30 days makes the block a recurring spot.
  const third = await report(student, 'Projector socket sparks when plugged in', { location: 'B-II', detail: 'CS-205' });
  assert.equal(third.data.merged, false);

  const { status, data } = await call('GET', '/api/insights', { token: admin.token });
  assert.equal(status, 200);
  assert.ok(data.totals.duplicates_merged >= 2);
  assert.ok(data.totals.avg_resolution_hours !== null);
  assert.ok(data.recurring.some((r) => r.category === 'electrical' && r.location === 'B-II' && r.occurrences >= 3));
  assert.deepEqual(data.recurring_rule, { min: 3, days: 30 });
  assert.ok(data.resolution_by_category.some((r) => r.category === 'electrical' && r.avg_hours >= 0));
  assert.ok(data.totals.reopens >= 0);
  assert.ok(data.hotspots.find((h) => h.location === 'B-II').issues >= 2);
});

test('repeated failed logins are throttled, and responses carry security headers', async () => {
  await signup('Lena');
  const attempt = () => call('POST', '/api/auth/login', { body: { email: 'lena@test.edu', password: 'wrong-password' } });
  for (let i = 0; i < 5; i++) assert.equal((await attempt()).status, 401);
  assert.equal((await attempt()).status, 429);

  const res = await fetch(`${base}/api/meta`);
  assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});

test('QR endpoint renders an SVG for report links and rejects anything else', async () => {
  const ok = await fetch(`${base}/api/qr?data=${encodeURIComponent('http://192.168.1.2:3001/#/report?location=B-II')}`);
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('content-type'), /image\/svg\+xml/);
  assert.match(await ok.text(), /<svg/);
  assert.equal((await fetch(`${base}/api/qr?data=javascript:alert(1)`)).status, 400);
  assert.equal((await fetch(`${base}/api/qr`)).status, 400);
});

test('only a reporter can confirm or reopen, and new evidence reopens automatically', async () => {
  const [p, q, r] = await Promise.all(['Priya', 'Qadir', 'Rohan'].map(signup));
  const admin = await adminLogin();
  const id = (await report(p, 'Ceiling fan makes loud noise and stopped', { category: 'electrical', location: 'Papum' })).data.issueId;
  const fix = () => call('PATCH', `/api/issues/${id}`, { token: admin, body: { status: 'awaiting_confirmation' } });
  const detail = async () => (await call('GET', `/api/issues/${id}`, { token: admin })).data;

  // Cannot confirm before the team claims a fix, and bystanders can never confirm.
  assert.equal((await call('POST', `/api/issues/${id}/confirm`, { token: p })).status, 409);
  await fix();
  assert.equal((await call('POST', `/api/issues/${id}/confirm`, { token: q })).status, 403);
  assert.equal((await call('POST', `/api/issues/${id}/confirm`, { token: admin })).status, 403);

  // The reporter says it is not fixed.
  assert.equal((await call('POST', `/api/issues/${id}/reopen`, { token: p, body: { note: 'Still broken' } })).status, 200);
  let d = await detail();
  assert.equal(d.issue.status, 'open');
  assert.equal(d.issue.reopen_count, 1);
  assert.ok(d.issue.priority.reasons.some((x) => /reopened/.test(x)));

  // A claimed fix followed by a new "me too" means the problem is evidently still there.
  await fix();
  assert.equal((await call('POST', `/api/issues/${id}/me-too`, { token: r })).status, 201);
  d = await detail();
  assert.equal(d.issue.status, 'open');
  assert.equal(d.issue.reopen_count, 2);

  // Finally fixed and confirmed; it cannot be confirmed twice.
  await fix();
  assert.equal((await call('POST', `/api/issues/${id}/confirm`, { token: p })).status, 200);
  assert.equal((await detail()).issue.status, 'resolved');
  assert.equal((await call('POST', `/api/issues/${id}/confirm`, { token: p })).status, 409);
});

test('overdue issues are flagged on the list and counted in insights', async () => {
  const s = await signup('Sana');
  const admin = await adminLogin();
  const id = (await report(s, 'Water leaking from a tap in the washroom', { category: 'water', location: 'Lohit-2' })).data.issueId;
  const fresh = (await call('GET', `/api/issues/${id}`, { token: s })).data.issue;
  assert.equal(fresh.sla.overdue, false);

  db.prepare('UPDATE issues SET created_at = ? WHERE id = ?').run(Date.now() - 30 * 3_600_000, id);
  const late = (await call('GET', `/api/issues/${id}`, { token: s })).data.issue;
  assert.equal(late.sla.overdue, true);
  assert.ok(late.priority.score >= fresh.priority.score + 20);

  const { data } = await call('GET', '/api/insights', { token: admin });
  assert.ok(data.totals.overdue >= 1);
  assert.ok(data.overdue.some((i) => i.id === id));
});

test('staff see and update only issues assigned to them, and cannot assign or view insights', async () => {
  const admin = await adminLogin();
  const staffId = makeStaff('Tara', 'IT Services');
  makeStaff('Uday', 'IT Services');
  const [tara, uday] = [await staffLogin('Tara'), await staffLogin('Uday')];
  const s = await signup('Vikram');
  const mine = (await report(s, 'Router in the lab keeps rebooting every minute', { category: 'wifi', location: 'B-III' })).data.issueId;
  const other = (await report(s, 'Wifi dead in the seminar hall completely', { category: 'wifi', location: 'Papum' })).data.issueId;
  await call('PATCH', `/api/issues/${mine}`, { token: admin, body: { assignee_id: staffId } });

  // Queue and detail are limited to assigned work.
  const queue = (await call('GET', '/api/issues', { token: tara })).data;
  assert.deepEqual(queue.map((i) => i.id), [mine]);
  assert.equal((await call('GET', '/api/issues', { token: uday })).data.length, 0);
  assert.equal((await call('GET', `/api/issues/${other}`, { token: tara })).status, 403);
  assert.equal((await call('GET', `/api/issues/${mine}`, { token: uday })).status, 403);

  // Staff can work their issue (reporter names stay hidden) but not assign or close it.
  const detail = await call('GET', `/api/issues/${mine}`, { token: tara });
  assert.equal(detail.data.reports.length, 1);
  assert.equal(detail.data.reports[0].reporter, undefined);
  assert.equal((await call('PATCH', `/api/issues/${mine}`, { token: tara, body: { status: 'in_progress', note: 'On it' } })).status, 200);
  assert.equal((await call('PATCH', `/api/issues/${other}`, { token: tara, body: { status: 'in_progress' } })).status, 403);
  assert.equal((await call('PATCH', `/api/issues/${mine}`, { token: tara, body: { assignee_id: null } })).status, 403);
  assert.equal((await call('PATCH', `/api/issues/${mine}`, { token: tara, body: { status: 'resolved' } })).status, 400);
  assert.equal((await call('PATCH', `/api/issues/${mine}`, { token: tara, body: { status: 'awaiting_confirmation' } })).status, 200);

  // Role boundaries elsewhere.
  assert.equal((await call('GET', '/api/insights', { token: tara })).status, 403);
  assert.equal((await call('GET', '/api/staff', { token: tara })).status, 403);
  assert.equal((await call('GET', '/api/staff', { token: admin })).data.some((x) => x.name === 'Tara'), true);
  assert.equal((await call('GET', '/api/staff', { token: s })).status, 403);
  assert.equal((await report(tara, 'Staff trying to file a report as a student')).status, 403);
  assert.equal((await call('PATCH', `/api/issues/${mine}`, { token: s, body: { status: 'open' } })).status, 403);
});

test('two occurrences, or three spread beyond 30 days, are not flagged as recurring', async () => {
  const { buildInsights } = await import('../server/insights.js');
  const fresh = openDb(':memory:');
  const add = (location, createdAt) => fresh.prepare("INSERT INTO issues (title,category,location,description,department,created_at,updated_at) VALUES ('t','wifi',?,'down','x',?,?)").run(location, createdAt, createdAt);
  const now = Date.now();
  const day = 86_400_000;
  add('Central Library', now - day); add('Central Library', now - 2 * day);              // only two
  add('Lohit-1', now - day); add('Lohit-1', now - 40 * day); add('Lohit-1', now - 50 * day); // two are outside the window
  add('Administrative Building', now - day); add('Administrative Building', now - 5 * day); add('Administrative Building', now - 10 * day); // three in 30 days
  const flagged = buildInsights(fresh, now).recurring.map((r) => r.location);
  assert.deepEqual(flagged, ['Administrative Building']);
});

test('meta serves the NIT Arunachal Pradesh campus map and rejects unknown places', async () => {
  const { data } = await call('GET', '/api/meta');
  assert.deepEqual(data.campus.map((g) => g.group), ['Blocks', 'Hostels', 'Faculty Residence', 'Other Residence & Facilities']);
  assert.equal(data.locations.length, 17);
  for (const name of ['B-I', 'B-IV', 'Central Library', 'Administrative Building', 'Subansiri', 'Lohit-1', 'Lohit-2', 'Papum', 'Hospital', 'K.V']) {
    assert.ok(data.locations.includes(name), name);
  }
  const s = await signup('Meera');
  assert.equal((await report(s, 'Light is broken in the corridor', { location: 'CS Block' })).status, 400);
});

test('the assigned team or an admin acknowledges an issue once, and students see it on the timeline', async () => {
  const admin = await adminLogin();
  const staffId = makeStaff('Wasim', 'IT Services');
  makeStaff('Xena', 'IT Services');
  const [wasim, xena] = [await staffLogin('Wasim'), await staffLogin('Xena')];
  const s = await signup('Yash');
  const id = (await report(s, 'Projector cable is missing in the seminar hall', { category: 'classroom', location: 'B-IV' })).data.issueId;
  await call('PATCH', `/api/issues/${id}`, { token: admin, body: { assignee_id: staffId } });

  // Students and unrelated staff cannot acknowledge.
  assert.equal((await call('POST', `/api/issues/${id}/acknowledge`, { token: s })).status, 403);
  assert.equal((await call('POST', `/api/issues/${id}/acknowledge`, { token: xena })).status, 403);
  assert.equal((await call('POST', '/api/issues/99999/acknowledge', { token: admin })).status, 404);

  const ack = await call('POST', `/api/issues/${id}/acknowledge`, { token: wasim });
  assert.equal(ack.status, 200);
  assert.equal(ack.data.issue.acknowledged_by, 'Wasim');
  assert.ok(ack.data.issue.acknowledged_at);

  // The first acknowledgement stands.
  assert.equal((await call('POST', `/api/issues/${id}/acknowledge`, { token: admin })).status, 409);

  const seen = (await call('GET', `/api/issues/${id}`, { token: s })).data;
  assert.equal(seen.issue.acknowledged_by, 'Wasim');
  assert.match(seen.log.at(-1).note, /Acknowledged/);
  assert.equal(seen.issue.status, 'assigned');
});

test('suggestions work without any key, are student-only and rate limited', async () => {
  const student = await signup('Zara');
  const status = (await call('GET', '/api/ai/status', { token: student })).data;
  assert.equal(status.enabled, true);
  assert.equal(status.engine, 'built-in rules');

  const ok = await call('POST', '/api/ai/suggest', { token: student, body: { description: 'ceiling fan not working in the lab', location: 'B-I' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.category, 'electrical');
  assert.equal(ok.data.source, 'built-in rules');
  assert.match(ok.data.description, /Location: B-I/);

  assert.equal((await call('POST', '/api/ai/suggest', { token: student, body: { description: 'short' } })).status, 400);
  assert.equal((await call('POST', '/api/ai/suggest', { body: { description: 'ceiling fan not working' } })).status, 401);
  assert.equal((await call('POST', '/api/ai/suggest', { token: await adminLogin(), body: { description: 'ceiling fan not working' } })).status, 403);

  // 20 requests a minute per student; the 21st is refused.
  let last;
  for (let i = 0; i < 20; i++) last = await call('POST', '/api/ai/suggest', { token: student, body: { description: 'ceiling fan not working in the lab' } });
  assert.equal(last.status, 429);
});
