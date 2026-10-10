import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// The optional number separates two backups made in the same second.
const BACKUP_NAME = /^backup-\d{8}-\d{6}(?:-\d+)?$/;

const stamp = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

// Oldest first. Names sort by time because the stamp runs year, month, day, hour, minute, second.
export const listBackups = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => BACKUP_NAME.test(n)).sort() : []);

// One backup is a folder holding a consistent copy of the database (taken with SQLite's own VACUUM INTO, which is
// safe while the site is serving requests) and a copy of the uploaded photos.
export function backupNow(db, { dir, uploadDir, keep = 14, now = new Date() }) {
  fs.mkdirSync(dir, { recursive: true });
  let name = `backup-${stamp(now)}`;
  for (let n = 2; fs.existsSync(path.join(dir, name)); n++) name = `backup-${stamp(now)}-${n}`;
  const target = path.join(dir, name);
  fs.mkdirSync(target);
  db.exec(`VACUUM INTO '${path.join(target, 'campusfix.db').replace(/'/g, "''")}'`);
  if (uploadDir && fs.existsSync(uploadDir)) fs.cpSync(uploadDir, path.join(target, 'uploads'), { recursive: true });
  return { name, path: target, removed: prune(dir, keep) };
}

// Keeps the newest `keep` backups and deletes the rest.
function prune(dir, keep) {
  const all = listBackups(dir);
  const old = all.slice(0, Math.max(0, all.length - keep));
  for (const name of old) fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  return old;
}

// Puts a backup back. The site must be stopped first. The current database and photos are kept beside it
// (with a ".before-restore" suffix) so a restore can itself be undone.
export function restoreBackup({ source, dbFile, uploadDir }) {
  const backupDb = path.join(source, 'campusfix.db');
  if (!fs.existsSync(backupDb)) throw new Error(`${source} does not contain campusfix.db`);
  const check = new DatabaseSync(backupDb, { readOnly: true });
  check.prepare('SELECT COUNT(*) FROM users').get(); // must be a readable database of ours
  check.close();

  const suffix = `.before-restore-${stamp(new Date())}`;
  if (fs.existsSync(dbFile)) fs.renameSync(dbFile, dbFile + suffix);
  for (const extra of ['-wal', '-shm']) if (fs.existsSync(dbFile + extra)) fs.rmSync(dbFile + extra);
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  fs.copyFileSync(backupDb, dbFile);

  const photos = path.join(source, 'uploads');
  if (uploadDir && fs.existsSync(photos)) {
    if (fs.existsSync(uploadDir)) fs.renameSync(uploadDir, uploadDir + suffix);
    fs.cpSync(photos, uploadDir, { recursive: true });
  }
  return { database: dbFile, previous: dbFile + suffix };
}

// Runs a backup 30 seconds after start and then every `hours`. A failed backup is logged and tried again next
// time; it never takes the site down.
export function scheduleBackups(db, options, hours, log = console) {
  const run = () => {
    try {
      const { name, removed } = backupNow(db, options);
      log.log(`Backup saved: ${name}${removed.length ? ` (removed ${removed.length} old)` : ''}`);
    } catch (err) {
      log.error(`Backup failed: ${err.message}`);
    }
  };
  const first = setTimeout(run, 30_000);
  const every = setInterval(run, hours * 3_600_000);
  first.unref();
  every.unref();
  return () => { clearTimeout(first); clearInterval(every); };
}
