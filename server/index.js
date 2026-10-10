import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lanAddresses } from './network.js';
import { backupDir, backupKeep, dbFile, uploadDir } from './paths.js';

const port = Number(process.env.PORT) || 3000;
const production = process.env.NODE_ENV === 'production';

// node:sqlite needs a recent Node; explain that instead of crashing with an obscure import error.
let openDb, createApp, purgeExpiredSessions, purgeOldNotifications, scheduleBackups;
try {
  ({ openDb, purgeExpiredSessions, purgeOldNotifications } = await import('./db.js'));
  ({ createApp } = await import('./app.js'));
  ({ scheduleBackups } = await import('./backup.js'));
} catch (err) {
  if (err.code === 'ERR_UNKNOWN_BUILTIN_MODULE') {
    console.error(`UniSeva Portal needs Node.js 22.13 or newer (found ${process.version}). Install it from https://nodejs.org and try again.`);
    process.exit(1);
  }
  throw err;
}

const db = openDb(dbFile());

// First run on an empty database.
//   development: fill in the demo accounts and issues so the site is usable straight away
//   production:  create only the admin (ADMIN_EMAIL / ADMIN_PASSWORD are required), or the demo data when SEED_DEMO=1
//   NO_AUTO_SEED=1: start empty either way
if (!db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
  if (process.env.NO_AUTO_SEED) {
    console.warn('No accounts exist yet, so nobody can sign in. Run "npm run seed" first.');
  } else {
    const adminOnly = production && !process.env.SEED_DEMO;
    console.log(adminOnly ? 'First run: creating the admin account...' : 'First run: creating the demo accounts and issues...');
    try {
      execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/seed.js', import.meta.url))], {
        stdio: 'inherit',
        env: { ...process.env, ...(adminOnly ? { ADMIN_ONLY: '1' } : {}) },
      });
    } catch {
      // The seed explains what went wrong (a missing or weak ADMIN_PASSWORD, an ADMIN_EMAIL outside @nitap.ac.in).
      if (production) {
        console.error('Not starting: fix the settings above and start again.');
        process.exit(1);
      }
      // In development keep serving, so a restart loop does not hide the message.
      console.warn('The demo data could not be created (see above). The site is running, but nobody can sign in yet.');
    }
  }
}

// Expired sign-in sessions and old notifications are useless rows; clear them now and hourly.
const tidy = () => { purgeExpiredSessions(db); purgeOldNotifications(db); };
tidy();
const sessionCleanup = setInterval(tidy, 3_600_000);
sessionCleanup.unref();

// Automatic backups: daily in production; set BACKUP_EVERY_HOURS to change it, or to 0 to turn them off.
const backupHours = process.env.BACKUP_EVERY_HOURS === undefined ? (production ? 24 : 0) : Number(process.env.BACKUP_EVERY_HOURS);
if (backupHours > 0) {
  scheduleBackups(db, { dir: backupDir(), uploadDir: uploadDir(), keep: backupKeep() }, backupHours);
  console.log(`Automatic backups every ${backupHours}h into ${backupDir()} (keeping ${backupKeep()}).`);
}

const server = createApp(db).listen(port, () => {
  console.log('UniSeva Portal, designed and developed by Ujjawal Singh and Anirudh Mishra');
  console.log(`UniSeva Portal running at http://localhost:${port}${production ? ' (production mode)' : ''}`);
  for (const { address } of lanAddresses()) console.log(`On your network:        http://${address}:${port}`);
});
server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`Port ${port} is already in use. Stop the other server or run with a different port, e.g. PORT=3001 npm start.`);
  process.exit(1);
});

// A host stops the site with SIGTERM when it redeploys. Finish the requests in flight and close the database
// cleanly instead of cutting them off.
let stopping = false;
function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal} received: finishing current requests and shutting down.`);
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  server.close(() => {
    try { db.close(); } catch { /* already closed */ }
    process.exit(0);
  });
  server.closeIdleConnections?.();
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => shutdown(signal));
