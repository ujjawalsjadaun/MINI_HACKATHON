import fs from 'node:fs';
import path from 'node:path';
import { Counter, Feedback, Issue, Notification, Report, Session, StatusLog, User } from '../models/index.js';

// Every collection that holds data worth keeping. A backup is each one written as a file of JSON lines
// (one document per line), so it needs no database tool to make, read or restore.
const MODELS = [User, Session, Issue, Report, Feedback, Notification, StatusLog, Counter];
const fileOf = (Model) => `${Model.collection.name}.jsonl`;
const FORMAT = 1;

// The optional number separates two backups made in the same second.
const BACKUP_NAME = /^backup-\d{8}-\d{6}(?:-\d+)?$/;

const stamp = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

// Oldest first. Names sort by time because the stamp runs year, month, day, hour, minute, second.
export const listBackups = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => BACKUP_NAME.test(n)).sort() : []);

// Writes the whole database into `target` (a folder that already exists), one stream at a time so a big
// collection never has to fit in memory.
async function dumpDatabase(target) {
  const counts = {};
  for (const Model of MODELS) {
    const out = fs.createWriteStream(path.join(target, fileOf(Model)));
    let n = 0;
    for await (const doc of Model.find().select('-_id').lean().cursor()) {
      if (!out.write(`${JSON.stringify(doc)}\n`)) await new Promise((resolve) => out.once('drain', resolve));
      n++;
    }
    await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
    counts[Model.collection.name] = n;
  }
  fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify({ format: FORMAT, created: new Date().toISOString(), collections: counts }, null, 2));
  return counts;
}

// One backup is a folder holding a copy of the database ("db") and a copy of the uploaded photos ("uploads").
export async function backupNow({ dir, uploadDir, keep = 14, now = new Date() }) {
  fs.mkdirSync(dir, { recursive: true });
  let name = `backup-${stamp(now)}`;
  for (let n = 2; fs.existsSync(path.join(dir, name)); n++) name = `backup-${stamp(now)}-${n}`;
  const target = path.join(dir, name);
  fs.mkdirSync(path.join(target, 'db'), { recursive: true });
  await dumpDatabase(path.join(target, 'db'));
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

// Reads and checks a whole backup before anything is touched, so a damaged one can never half-replace live data.
function readBackup(source) {
  const dbDir = path.join(source, 'db');
  const manifestFile = path.join(dbDir, 'manifest.json');
  if (!fs.existsSync(manifestFile)) throw new Error(`${source} does not contain a UniSeva database backup`);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (manifest.format !== FORMAT) throw new Error(`Unknown backup format ${manifest.format}`);
  return MODELS.map((Model) => {
    const file = path.join(dbDir, fileOf(Model));
    if (!fs.existsSync(file)) throw new Error(`The backup is missing ${fileOf(Model)}`);
    const docs = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
    if (docs.length !== manifest.collections[Model.collection.name]) throw new Error(`${fileOf(Model)} does not match its manifest`);
    return { Model, docs };
  });
}

// Puts a backup back. The site must be stopped first. What it replaces is saved first, in a "before-restore"
// folder next to the backups (and the photos with a ".before-restore" suffix), so a restore can itself be undone.
export async function restoreBackup({ source, uploadDir, saveDir = path.dirname(source) }) {
  const collections = readBackup(source);

  const suffix = `.before-restore-${stamp(new Date())}`;
  const previous = path.join(saveDir, `before-restore-${stamp(new Date())}`);
  fs.mkdirSync(path.join(previous, 'db'), { recursive: true });
  await dumpDatabase(path.join(previous, 'db'));

  for (const { Model, docs } of collections) {
    await Model.deleteMany({});
    if (docs.length) await Model.insertMany(docs, { ordered: true });
  }

  const photos = path.join(source, 'uploads');
  if (uploadDir && fs.existsSync(photos)) {
    if (fs.existsSync(uploadDir)) fs.renameSync(uploadDir, uploadDir + suffix);
    fs.cpSync(photos, uploadDir, { recursive: true });
  }
  return { previous };
}

// Runs a backup 30 seconds after start and then every `hours`. A failed backup is logged and tried again next
// time; it never takes the site down.
export function scheduleBackups(options, hours, log = console) {
  const run = async () => {
    try {
      const { name, removed } = await backupNow(options);
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
