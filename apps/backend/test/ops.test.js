// Running it for real: backups, restore, rate limits, request logs, and the production start-up rules.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { backupNow, listBackups, restoreBackup } from '../src/services/backup.js';
import { createApp } from '../src/app.js';
import { createUser, purgeExpiredSessions } from '../src/services/accounts.js';
import { connectDb, disconnectDb, dropDb } from '../src/db/connect.js';
import { HttpError } from '../src/lib/http.js';
import { rateLimiter } from '../src/lib/ratelimit.js';
import { Issue, Session, User } from '../src/models/index.js';
import { testDbUri } from './helpers.js';

const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `uniseva-${name}-`));
const root = new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');

const opsUri = testDbUri('ops');
before(() => connectDb(opsUri));
after(async () => { await dropDb(); await disconnectDb(); });

const emails = async () => (await User.find().sort({ id: 1 }).lean()).map((u) => u.email);

test('a backup is a consistent copy of the database and photos, and old ones are pruned', async () => {
  await User.deleteMany({});
  const dir = tmp('bk');
  const uploads = path.join(dir, 'uploads');
  fs.mkdirSync(uploads);
  fs.writeFileSync(path.join(uploads, 'photo.jpg'), 'pretend photo');
  await createUser({ name: 'Asha', email: 'asha@nitap.ac.in', password: 'student1234' });

  const backups = path.join(dir, 'backups');
  const first = await backupNow({ dir: backups, uploadDir: uploads, keep: 2, now: new Date(2026, 9, 1, 2, 0, 0) });
  assert.equal(first.name, 'backup-20261001-020000');
  assert.equal(fs.readFileSync(path.join(first.path, 'uploads', 'photo.jpg'), 'utf8'), 'pretend photo');
  const dumped = fs.readFileSync(path.join(first.path, 'db', 'users.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(dumped.map((u) => u.email), ['asha@nitap.ac.in']);

  // Two in the same second do not overwrite each other; only the newest `keep` survive.
  const again = await backupNow({ dir: backups, uploadDir: uploads, keep: 2, now: new Date(2026, 9, 1, 2, 0, 0) });
  assert.equal(again.name, 'backup-20261001-020000-2');
  const last = await backupNow({ dir: backups, uploadDir: uploads, keep: 2, now: new Date(2026, 9, 2, 2, 0, 0) });
  assert.deepEqual(last.removed, ['backup-20261001-020000']);
  assert.deepEqual(listBackups(backups), ['backup-20261001-020000-2', 'backup-20261002-020000']);

  fs.writeFileSync(path.join(backups, 'notes.txt'), 'not a backup');
  assert.equal(listBackups(backups).length, 2, 'other files in the folder are ignored and never deleted');
  assert.ok(fs.existsSync(path.join(backups, 'notes.txt')));
});

test('restoring brings the old data back and keeps what it replaced', async () => {
  await User.deleteMany({});
  const dir = tmp('rs');
  const uploads = path.join(dir, 'uploads');
  fs.mkdirSync(uploads);
  fs.writeFileSync(path.join(uploads, 'before.jpg'), 'v1');
  await createUser({ name: 'Asha', email: 'asha@nitap.ac.in', password: 'student1234' });
  const { path: saved } = await backupNow({ dir: path.join(dir, 'backups'), uploadDir: uploads });

  // Things go wrong afterwards.
  await createUser({ name: 'Mistake', email: 'mistake@nitap.ac.in', password: 'student1234' });
  fs.rmSync(path.join(uploads, 'before.jpg'));
  fs.writeFileSync(path.join(uploads, 'after.jpg'), 'v2');

  const result = await restoreBackup({ source: saved, uploadDir: uploads });
  assert.deepEqual(await emails(), ['asha@nitap.ac.in']);
  assert.equal(fs.readFileSync(path.join(uploads, 'before.jpg'), 'utf8'), 'v1');
  assert.ok(!fs.existsSync(path.join(uploads, 'after.jpg')));
  assert.ok(fs.existsSync(path.join(result.previous, 'db', 'users.jsonl')), 'the data it replaced is kept, so a restore can be undone');

  await assert.rejects(restoreBackup({ source: dir, uploadDir: uploads }), /does not contain a UniSeva database backup/);

  // A damaged backup (a collection file that no longer matches its manifest) is refused before anything changes.
  const bad = path.join(dir, 'bad');
  fs.cpSync(saved, bad, { recursive: true });
  fs.writeFileSync(path.join(bad, 'db', 'users.jsonl'), '');
  await assert.rejects(restoreBackup({ source: bad, uploadDir: uploads }), /does not match its manifest/);
  assert.deepEqual(await emails(), ['asha@nitap.ac.in'], 'a bad backup leaves the live data untouched');
});

test('expired sign-in sessions are cleared out', async () => {
  await User.deleteMany({});
  await Session.deleteMany({});
  const id = await createUser({ name: 'Asha', email: 'asha@nitap.ac.in', password: 'student1234' });
  await Session.create({ token: 'old', user_id: id, expires_at: 1000 });
  await Session.create({ token: 'fresh', user_id: id, expires_at: Date.now() + 100000 });
  assert.equal(await purgeExpiredSessions(), 1);
  assert.deepEqual((await Session.find().lean()).map((s) => s.token), ['fresh']);
});

test('the rate limiter counts per client and recovers after the window', () => {
  let clock = 0;
  const limit = rateLimiter({ windowMs: 1000, max: 2, now: () => clock });
  const res = { headers: {}, set(k, v) { this.headers[k] = v; } };
  const hit = (ip) => { let err; limit({ ip }, res, (e) => { err = e; }); return err?.status; };
  assert.equal(hit('a'), undefined);
  assert.equal(hit('a'), undefined);
  assert.equal(hit('a'), 429, 'the third request in the window is refused');
  assert.equal(res.headers['Retry-After'], '1');
  assert.equal(hit('b'), undefined, 'another client is not affected');
  clock = 1001;
  assert.equal(hit('a'), undefined, 'allowed again once the window has passed');
});

async function withApp(options, run) {
  if (!(await User.exists({ email: 'admin@nitap.ac.in' }))) await createUser({ name: 'Admin', email: 'admin@nitap.ac.in', password: 'adminpass', role: 'admin' });
  const server = createApp({ uploadDir: tmp('up'), emergencyFile: path.join(tmp('em'), 'none.json'), ...options }).listen(0);
  await new Promise((r) => server.once('listening', r));
  try { await run(`http://localhost:${server.address().port}`); } finally { await new Promise((r) => server.close(r)); }
}

test('the API limit and the registration limit apply per connection, with a clear message', async () => {
  await withApp({ rateLimits: { api: { windowMs: 60_000, max: 6 }, register: { windowMs: 60_000, max: 2, error: () => new HttpError(429, 'Too many accounts were created from this connection. Try again later.') } } }, async (base) => {
    const register = (n) => fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Person ${n}`, email: `p${n}@nitap.ac.in`, password: 'secret123', securityQuestion: 'x', securityAnswer: 'y' }) });
    assert.notEqual((await register(1)).status, 429);
    assert.notEqual((await register(2)).status, 429);
    const third = await register(3);
    assert.equal(third.status, 429);
    assert.match((await third.json()).error, /Too many accounts/);

    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await fetch(`${base}/api/meta`)).status);
    assert.deepEqual(statuses.slice(-1), [429], 'the general API limit also applies');
  });
});

test('request logs show method, path, status and time but never the query string or a token', async () => {
  const lines = [];
  await withApp({ logRequests: true, log: (l) => lines.push(l) }, async (base) => {
    await fetch(`${base}/api/auth/security-question?email=secret.person@nitap.ac.in`, { headers: { authorization: 'Bearer SECRET-TOKEN' } });
    await fetch(`${base}/api/health`);
  });
  assert.equal(lines.length, 1, 'health checks are not logged');
  assert.match(lines[0], /GET \/api\/auth\/security-question 200 \d+ms$/);
  assert.ok(!lines[0].includes('secret.person') && !lines[0].includes('SECRET-TOKEN'));
});

test('production sends the HSTS header and development does not', async () => {
  process.env.NODE_ENV = 'production';
  try {
    await withApp({ rateLimits: null, logRequests: false }, async (base) => {
      assert.match((await fetch(`${base}/api/health`)).headers.get('strict-transport-security'), /max-age=31536000/);
    });
  } finally { delete process.env.NODE_ENV; }
  await withApp({ rateLimits: null, logRequests: false }, async (base) => {
    assert.equal((await fetch(`${base}/api/health`)).headers.get('strict-transport-security'), null);
  });
});

// ---- starting the real server as a separate process
function run(args, env) {
  const dir = tmp('proc');
  const result = spawnSync(process.execPath, args, {
    cwd: root, encoding: 'utf8', timeout: 30_000,
    env: { ...process.env, MONGODB_URI: testDbUri('proc'), UPLOAD_DIR: path.join(dir, 'up'), NODE_ENV: '', ...env },
  });
  return { ...result, dir, out: `${result.stdout}${result.stderr}` };
}

test('production refuses to create an admin with a missing or public password', () => {
  for (const password of [undefined, 'admin1234', 'short']) {
    const r = run(['scripts/seed.js'], { NODE_ENV: 'production', ADMIN_PASSWORD: password ?? '' });
    assert.notEqual(r.status, 0, `password ${password}`);
    assert.match(r.out, /private password of at least 10 characters/);
  }
});

test('production start-up creates only the admin, not the demo accounts', async () => {
  const uri = testDbUri('seedonly');
  const r = run(['scripts/seed.js'], { NODE_ENV: 'production', ADMIN_ONLY: '1', ADMIN_PASSWORD: 'a-strong-private-one', MONGODB_URI: uri });
  assert.equal(r.status, 0, r.out);
  await disconnectDb();
  await connectDb(uri);
  try {
    assert.deepEqual((await User.find().lean()).map((u) => `${u.email}:${u.role}`), ['admin@nitap.ac.in:admin']);
    assert.equal(await Issue.countDocuments(), 0);
    await dropDb();
  } finally {
    await disconnectDb();
    await connectDb(opsUri);
  }
});

test('the production server starts, answers its health check, backs up, and stops cleanly on SIGTERM', async () => {
  const dir = tmp('live');
  const dbUri = testDbUri('live');
  const port = 3400 + Math.floor(Math.random() * 400);
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'production', PORT: String(port), MONGODB_URI: dbUri, UPLOAD_DIR: path.join(dir, 'up'), ADMIN_PASSWORD: 'a-strong-private-one', BACKUP_EVERY_HOURS: '24', LOG_REQUESTS: '0' },
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  try {
    let health;
    for (let i = 0; i < 60 && !health; i++) {
      try { health = await (await fetch(`http://localhost:${port}/api/health`)).json(); } catch { await new Promise((r) => setTimeout(r, 250)); }
    }
    assert.deepEqual(health, { ok: true }, out);
    assert.match(out, /First run: creating the admin account/);
    assert.match(out, /Automatic backups every 24h/);
    const login = await fetch(`http://localhost:${port}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@nitap.ac.in', password: 'a-strong-private-one' }) });
    assert.equal(login.status, 200, 'the admin set through ADMIN_PASSWORD can sign in');
    const demo = await fetch(`http://localhost:${port}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'asha@nitap.ac.in', password: 'student1234' }) });
    assert.equal(demo.status, 401, 'no demo accounts in production');
  } finally {
    child.kill('SIGTERM');
  }
  const { code, signal } = await exited;
  // On Windows a signal ends the process at once; elsewhere the handler runs and exits 0.
  assert.ok(code === 0 || signal === 'SIGTERM' || process.platform === 'win32', `exit ${code} ${signal}\n${out}`);
  if (process.platform !== 'win32') assert.match(out, /SIGTERM received/);
});
