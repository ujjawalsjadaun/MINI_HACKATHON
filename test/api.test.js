import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { createUser } from '../server/auth.js';
import { loadEmergencyContacts } from '../server/emergency.js';
import { SECURITY_QUESTIONS } from '../server/config.js';
import { openDb } from '../server/db.js';

let server, base, uploadDir;
const db = openDb(':memory:');

before(async () => {
  uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campusfix-'));
  createUser(db, { name: 'Admin', email: 'admin@nitap.ac.in', password: 'adminpass', role: 'admin' });
  server = createApp(db, { uploadDir, emergencyFile: path.join(uploadDir, 'no-such-file.json') }).listen(0);
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

const QUESTION = SECURITY_QUESTIONS[0];
const tokens = {};
async function signup(name) {
  const { data } = await call('POST', '/api/auth/register', {
    body: { name, email: `${name.toLowerCase()}@nitap.ac.in`, password: 'secret123', securityQuestion: QUESTION, securityAnswer: 'Rani' },
  });
  tokens[name] = data.token;
  return data.token;
}

const makeStaff = (name, department) =>
  createUser(db, { name, email: `${name.toLowerCase()}@nitap.ac.in`, password: 'staffpass', role: 'staff', department });
const staffLogin = async (name) =>
  (await call('POST', '/api/auth/login', { body: { email: `${name.toLowerCase()}@nitap.ac.in`, password: 'staffpass' } })).data.token;

const adminLogin = async () =>
  (await call('POST', '/api/auth/login', { body: { email: 'admin@nitap.ac.in', password: 'adminpass' } })).data.token;

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
  const again = await call('POST', '/api/auth/register', { body: { name: 'Dup', email: 'dup@nitap.ac.in', password: 'secret123', securityQuestion: QUESTION, securityAnswer: 'Rani' } });
  assert.equal(again.status, 409);
});

test('only @nitap.ac.in addresses can register, sign in or reset a password', async () => {
  const outsiders = ['zoya@gmail.com', 'zoya@nitap.ac.in.evil.com', 'zoya@fake-nitap.ac.in', 'zoya@student.nitap.ac.in', '@nitap.ac.in'];
  for (const email of outsiders) {
    const reg = await call('POST', '/api/auth/register', { body: { name: 'Zoya', email, password: 'secret123', securityQuestion: QUESTION, securityAnswer: 'Rani' } });
    assert.equal(reg.status, 400, `register ${email}`);
    assert.match(reg.data.error, /@nitap\.ac\.in/);
    assert.equal((await call('POST', '/api/auth/login', { body: { email, password: 'secret123' } })).status, 400, `login ${email}`);
    assert.equal((await call('GET', `/api/auth/security-question?email=${encodeURIComponent(email)}`)).status, 400, `question ${email}`);
    assert.equal((await call('POST', '/api/auth/reset-password', { body: { email, answer: 'Rani', password: 'secret123' } })).status, 400, `reset ${email}`);
  }
  // Letter case does not matter: the address is stored and matched in lower case.
  const ok = await call('POST', '/api/auth/register', { body: { name: 'Zoya', email: 'Zoya@NITAP.AC.IN', password: 'secret123', securityQuestion: QUESTION, securityAnswer: 'Rani' } });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.user.email, 'zoya@nitap.ac.in');
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'ZOYA@nitap.ac.in', password: 'secret123' } })).status, 200);
});

test('demo accounts from before the email rule are moved to @nitap.ac.in on startup', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'campusfix-db-')), 'old.db');
  const old = openDb(file);
  // Written straight into the table, as a database seeded before the rule would hold them.
  const insert = old.prepare("INSERT INTO users (name, email, password_hash, salt, role, created_at) VALUES (?, ?, 'x', 'x', 'student', 0)");
  insert.run('Asha', 'asha@campusfix.local');
  insert.run('Kept', 'kept@nitap.ac.in');
  old.close();
  const reopened = openDb(file);
  assert.deepEqual(reopened.prepare('SELECT email FROM users ORDER BY id').all().map((u) => u.email), ['asha@nitap.ac.in', 'kept@nitap.ac.in']);
  reopened.close();
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
  const { data: admin } = await call('POST', '/api/auth/login', { body: { email: 'admin@nitap.ac.in', password: 'adminpass' } });
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

  const { data: admin } = await call('POST', '/api/auth/login', { body: { email: 'admin@nitap.ac.in', password: 'adminpass' } });
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
  const attempt = () => call('POST', '/api/auth/login', { body: { email: 'lena@nitap.ac.in', password: 'wrong-password' } });
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

test('QR stickers get this computer\'s network address, never localhost (admins only)', async () => {
  assert.equal((await call('GET', '/api/qr/addresses')).status, 401);
  assert.equal((await call('GET', '/api/qr/addresses', { token: await signup('Ishaan') })).status, 403);
  const { status, data } = await call('GET', '/api/qr/addresses', { token: await adminLogin() });
  assert.equal(status, 200);
  const port = new URL(base).port;
  for (const a of data.addresses) {
    assert.match(a.url, new RegExp(`^http://\\d+\\.\\d+\\.\\d+\\.\\d+:${port}$`));
    assert.doesNotMatch(a.url, /localhost|127\.0\.0\.1/);
  }
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

test('registration needs one of the listed security questions and a usable answer', async () => {
  const register = (extra) => call('POST', '/api/auth/register', { body: { name: 'Samir', email: 'samir@nitap.ac.in', password: 'secret123', ...extra } });
  assert.equal((await register({})).status, 400);
  assert.equal((await register({ securityQuestion: 'Made-up question?', securityAnswer: 'Rani' })).status, 400);
  assert.equal((await register({ securityQuestion: QUESTION, securityAnswer: 'ab' })).status, 400);
  const ok = await register({ securityQuestion: QUESTION, securityAnswer: 'Rani' });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.user.security_set, true);
});

test('security question reset: right answer changes the password and ends all sessions', async () => {
  const student = await signup('Reena');
  const email = 'reena@nitap.ac.in';
  const reset = (body) => call('POST', '/api/auth/reset-password', { body: { email, password: 'brandnew1', ...body } });

  const asked = await call('GET', `/api/auth/security-question?email=${email}`);
  assert.equal(asked.data.question, QUESTION);

  assert.equal((await reset({ answer: 'Tommy' })).status, 400);
  assert.equal((await reset({ answer: 'rani', password: 'short' })).status, 400); // the new password is validated
  assert.equal((await call('POST', '/api/auth/login', { body: { email, password: 'secret123' } })).status, 200); // unchanged so far

  // Case and extra spaces do not matter.
  assert.equal((await reset({ answer: '  RANI ' })).status, 200);
  assert.equal((await call('GET', '/api/me', { token: student })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { body: { email, password: 'secret123' } })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { body: { email, password: 'brandnew1' } })).status, 200);
});

test('security question reset does not reveal accounts, locks after wrong answers, and skips admins', async () => {
  await signup('Rohan');
  const question = (email) => call('GET', `/api/auth/security-question?email=${email}`);

  // Unknown emails and admins look like any other account, and always get the same question.
  const ghost = (await question('nobody@nitap.ac.in')).data.question;
  assert.ok(SECURITY_QUESTIONS.includes(ghost));
  assert.equal((await question('nobody@nitap.ac.in')).data.question, ghost);
  assert.ok(SECURITY_QUESTIONS.includes((await question('admin@nitap.ac.in')).data.question));
  const wrong = (email, answer) => call('POST', '/api/auth/reset-password', { body: { email, answer, password: 'brandnew1' } });
  assert.equal((await wrong('nobody@nitap.ac.in', 'anything')).status, 400);
  assert.equal((await wrong('admin@nitap.ac.in', 'adminpass')).status, 400);

  // Five wrong answers lock the account's reset, even for the right answer.
  for (let i = 0; i < 5; i++) assert.equal((await wrong('rohan@nitap.ac.in', 'wrong')).status, 400);
  assert.equal((await wrong('rohan@nitap.ac.in', 'Rani')).status, 429);
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'rohan@nitap.ac.in', password: 'secret123' } })).status, 200);
});

test('signed-in users can set a security question with their current password', async () => {
  const id = createUser(db, { name: 'Old', email: 'old@nitap.ac.in', password: 'oldpass1' }); // created before the feature
  const token = (await call('POST', '/api/auth/login', { body: { email: 'old@nitap.ac.in', password: 'oldpass1' } })).data.token;
  assert.equal((await call('GET', '/api/me', { token })).data.security_set, false);
  assert.ok(id);

  // No question yet means no reset is possible for this account.
  assert.equal((await call('POST', '/api/auth/reset-password', { body: { email: 'old@nitap.ac.in', answer: 'x', password: 'brandnew1' } })).status, 400);

  const put = (body) => call('PUT', '/api/me/security-question', { token, body });
  assert.equal((await put({ password: 'wrong-pass', question: QUESTION, answer: 'Rani' })).status, 403);
  assert.equal((await put({ password: 'oldpass1', question: 'Made-up?', answer: 'Rani' })).status, 400);
  assert.equal((await put({ password: 'oldpass1', question: QUESTION, answer: 'Rani' })).status, 200);
  assert.equal((await call('GET', '/api/me', { token })).data.security_set, true);
  assert.equal((await call('PUT', '/api/me/security-question', { body: {} })).status, 401);
  assert.equal((await call('POST', '/api/auth/reset-password', { body: { email: 'old@nitap.ac.in', answer: 'rani', password: 'brandnew1' } })).status, 200);
});

test('students rate urgency; the highest rating counts once and shows in the priority reasons', async () => {
  const [a, b, c] = await Promise.all(['Urvi', 'Utkarsh', 'Uma'].map(signup));
  const place = { category: 'wifi', location: 'B-III' };
  const scoreOf = async (id, token) => (await call('GET', `/api/issues/${id}`, { token })).data.issue.priority;

  assert.equal((await report(a, 'Wifi keeps dropping in room 12', { ...place, urgency: 'shouting' })).status, 400);

  const normal = await report(a, 'Wifi keeps dropping in room 12', { ...place, detail: 'Room 12' });
  const baseline = (await scoreOf(normal.data.issueId, a)).score;
  assert.ok(!(await scoreOf(normal.data.issueId, a)).reasons.some((r) => /reporter marked/.test(r)));

  // A second report on the same issue that is rated emergency lifts the issue.
  const merged = await report(b, 'Internet is down in room 12, router not working', { ...place, detail: 'Room 12', urgency: 'emergency' });
  assert.equal(merged.data.merged, true);
  const lifted = await scoreOf(normal.data.issueId, a);
  assert.ok(lifted.reasons.some((r) => /reporter marked it emergency \+25/.test(r)));
  assert.ok(lifted.score > baseline + 25 - 1); // +25 for urgency (the extra report adds a little more)

  // A later, calmer report does not lower it, and "urgent" ratings are not added on top of the emergency one.
  await report(c, 'Wifi down in room 12 again today', { ...place, detail: 'Room 12', urgency: 'urgent' });
  const after = await scoreOf(normal.data.issueId, a);
  assert.equal(after.reasons.filter((r) => /reporter marked/.test(r)).length, 1);
  assert.ok(after.reasons.some((r) => /emergency/.test(r)));
});

test('a pin dropped on the map is validated, saved with the issue, and adopted by a merged report if none was set', async () => {
  const [a, b] = await Promise.all(['Pia', 'Pranav'].map(signup));
  const place = { category: 'electrical', location: 'B-IV', detail: 'Lab 3' };

  // Pins must be a complete pair inside the map.
  assert.equal((await report(a, 'Tube light flickering in the lab', { ...place, pin_x: '0.4' })).status, 400);
  assert.equal((await report(a, 'Tube light flickering in the lab', { ...place, pin_x: '1.5', pin_y: '0.2' })).status, 400);
  assert.equal((await report(a, 'Tube light flickering in the lab', { ...place, pin_x: 'left', pin_y: '0.2' })).status, 400);

  // No pin: the issue simply has none.
  const first = await report(a, 'Tube light flickering in the lab', place);
  assert.equal(first.status, 201);
  const noPin = (await call('GET', `/api/issues/${first.data.issueId}`, { token: a })).data.issue;
  assert.equal(noPin.pin_x, null);

  // A merged report with a pin gives the issue its location on the map...
  const merged = await report(b, 'Light in lab 3 keeps flickering, tube light', { ...place, pin_x: '0.31234567', pin_y: '0.2' });
  assert.equal(merged.data.merged, true);
  const pinned = (await call('GET', `/api/issues/${first.data.issueId}`, { token: a })).data.issue;
  assert.deepEqual([pinned.pin_x, pinned.pin_y], [0.3123, 0.2]);

  // ...and the first pin stays.
  const c = await signup('Pooja');
  await report(c, 'Tube light flickering again in lab 3', { ...place, pin_x: '0.9', pin_y: '0.9' });
  const kept = (await call('GET', `/api/issues/${first.data.issueId}`, { token: a })).data.issue;
  assert.deepEqual([kept.pin_x, kept.pin_y], [0.3123, 0.2]);

  const meta = (await call('GET', '/api/meta')).data;
  assert.deepEqual(meta.mapSize, { width: 1000, height: 640 });
  assert.ok(meta.campus.every((g) => g.places.every((p) => p.map)));
});

test('students rate the fix once an issue is resolved; each role sees only what it should', async () => {
  const admin = await adminLogin();
  const staffId = makeStaff('Fahad', 'IT Services');
  const fahad = await staffLogin('Fahad');
  const [a, b, outsider] = await Promise.all(['Fiza', 'Faisal', 'Fenil'].map(signup));
  const place = { category: 'wifi', location: 'B-IV', detail: 'Lab 5' };
  const first = await report(a, 'Router in lab 5 keeps rebooting every few minutes', place);
  const id = first.data.issueId;
  await report(b, 'Wifi in lab 5 is down, router restarting again and again', place);
  await call('PATCH', `/api/issues/${id}`, { token: admin, body: { assignee_id: staffId } });
  const rate = (token, body) => call('POST', `/api/issues/${id}/feedback`, { token, body });

  // Not before the issue is resolved, and not by someone who never reported it.
  assert.equal((await rate(a, { rating: 5 })).status, 409);
  await resolveIssue(admin, id, a);
  assert.equal((await rate(outsider, { rating: 5 })).status, 403);
  assert.equal((await call('POST', `/api/issues/${id}/feedback`, { token: admin, body: { rating: 5 } })).status, 403);
  assert.equal((await call('POST', `/api/issues/${id}/feedback`, { body: { rating: 5 } })).status, 401);
  assert.equal((await call('POST', '/api/issues/99999/feedback', { token: a, body: { rating: 5 } })).status, 404);

  // Ratings are whole numbers from 1 to 5.
  for (const rating of [0, 6, 3.5, 'great', undefined]) assert.equal((await rate(a, { rating })).status, 400, String(rating));

  assert.equal((await call('GET', `/api/issues/${id}`, { token: a })).data.can_give_feedback, true);
  assert.equal((await rate(a, { rating: 2, comment: '  Fixed, but it took far too long  ' })).status, 201);
  assert.equal((await rate(b, { rating: 5 })).status, 201);

  // A student can change their rating; it does not create a second one.
  const changed = await rate(a, { rating: 4, comment: 'Better than I first thought' });
  assert.equal(changed.data.count, 2);
  assert.deepEqual(changed.data.mine, { rating: 4, comment: 'Better than I first thought' });
  assert.equal(changed.data.average, 4.5);

  // Students see the average and their own rating, never other students' comments.
  const asStudent = (await call('GET', `/api/issues/${id}`, { token: a })).data;
  assert.equal(asStudent.feedback.average, 4.5);
  assert.deepEqual(asStudent.feedback.entries, []);
  assert.equal(asStudent.issue.feedback_count, 2);
  assert.equal(asStudent.issue.feedback_avg, 4.5);

  // Staff read the comments without names; admins see who wrote them.
  const asStaff = (await call('GET', `/api/issues/${id}`, { token: fahad })).data.feedback;
  assert.equal(asStaff.entries.length, 2);
  assert.ok(asStaff.entries.every((e) => e.reporter === undefined));
  const asAdmin = (await call('GET', `/api/issues/${id}`, { token: admin })).data.feedback;
  assert.deepEqual(asAdmin.entries.map((e) => e.reporter).sort(), ['Faisal', 'Fiza']);

  // The student's own list says which fixes they have rated (and with what).
  const mine = (await call('GET', '/api/issues?mine=1', { token: a })).data.find((i) => i.id === id);
  assert.equal(mine.my_rating, 4);
  assert.equal((await call('GET', '/api/issues?mine=1', { token: outsider })).data.length, 0);

  // Insights summarise ratings and surface low ones with their comments (no names).
  await rate(b, { rating: 1, comment: 'Went down again next day' });
  const insights = (await call('GET', '/api/insights', { token: admin })).data;
  assert.ok(insights.totals.rated >= 2);
  assert.ok(insights.totals.avg_rating > 0);
  assert.ok(insights.feedback.by_category.some((c) => c.category === 'wifi'));
  const low = insights.feedback.low.find((x) => x.id === id);
  assert.equal(low.comment, 'Went down again next day');
  assert.equal(low.reporter, undefined);
  assert.equal((await call('GET', '/api/insights', { token: fahad })).status, 403);

  // An issue that is not resolved again cannot be rated.
  assert.equal((await call('GET', `/api/issues/${id}`, { token: outsider })).data.can_give_feedback, false);
});

test('the emergency directory comes from a private file, only for signed-in users, and is sanitised', async () => {
  const student = await signup('Emma');
  assert.equal((await call('GET', '/api/emergency')).status, 401);

  // With no private file only the public numbers are available.
  const bare = (await call('GET', '/api/emergency', { token: student })).data;
  assert.equal(bare.configured, false);
  assert.ok(bare.groups[0].entries.some((e) => e.phones.includes('112')));
  assert.ok(!JSON.stringify(bare).includes('Example'));

  // A private file adds groups; malformed entries and anything that is not a phone number are dropped.
  const file = path.join(uploadDir, 'contacts.json');
  fs.writeFileSync(file, JSON.stringify({
    groups: [
      { group: 'Medical', entries: [
        { role: 'Doctor', name: 'Example Doctor', phones: ['9000000001', 'javascript:alert(1)', '12', 'call me'], tags: ['Medical', 5] },
        { role: '', name: '', phones: ['9000000002'] },
      ] },
      { group: '', entries: [{ role: 'No heading', phones: ['9000000003'] }] },
      'not a group',
    ],
  }));
  const loaded = loadEmergencyContacts(file);
  assert.equal(loaded.configured, true);
  const medical = loaded.groups.find((g) => g.group === 'Medical');
  assert.equal(medical.entries.length, 1);
  assert.deepEqual(medical.entries[0].phones, ['9000000001']);
  assert.deepEqual(medical.entries[0].tags, ['medical']);
  assert.ok(!loaded.groups.some((g) => g.entries.some((e) => e.role === 'No heading')));

  // A broken file never takes the page down.
  fs.writeFileSync(file, '{ not json');
  assert.equal(loadEmergencyContacts(file).configured, false);
  assert.equal(loadEmergencyContacts(path.join(uploadDir, 'missing.json')).configured, false);
});

test('the health check answers for the host, and TRUST_PROXY gives each visitor their own login lock-out', async () => {
  assert.deepEqual((await call('GET', '/api/health')).data, { ok: true });

  // Behind a hosting proxy every request arrives from the proxy's address. Without TRUST_PROXY, five wrong
  // passwords from one visitor would lock the account for everybody; with it, the visitor's own address counts.
  process.env.TRUST_PROXY = '1';
  const proxied = createApp(db, { uploadDir, emergencyFile: path.join(uploadDir, 'no-such-file.json') }).listen(0);
  delete process.env.TRUST_PROXY;
  await new Promise((r) => proxied.once('listening', r));
  const url = `http://localhost:${proxied.address().port}/api/auth/login`;
  const attempt = (ip, password) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify({ email: 'admin@nitap.ac.in', password }) });
  try {
    for (let i = 0; i < 6; i++) await attempt('203.0.113.7', 'wrong-password');
    assert.equal((await attempt('203.0.113.7', 'adminpass')).status, 429, 'the visitor who failed is locked out');
    assert.equal((await attempt('198.51.100.9', 'adminpass')).status, 200, 'a different visitor is not');
  } finally {
    await new Promise((r) => proxied.close(r));
  }
});
