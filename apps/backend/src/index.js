import { backupDir, backupKeep, isProduction, uploadDir } from './config/env.js';
import { connectDb, disconnectDb } from './db/connect.js';
import { lanAddresses } from './lib/network.js';
import { createApp } from './app.js';
import { purgeExpiredSessions } from './services/accounts.js';
import { scheduleBackups } from './services/backup.js';
import { purgeOldNotifications } from './services/notifications.js';
import { SeedError, hasUsers, seedDatabase } from './services/seed.js';

const port = Number(process.env.PORT) || 3000;
const production = isProduction();

try {
  await connectDb();
} catch (err) {
  console.error(`Could not reach MongoDB (${err.message}).\nStart MongoDB, or set MONGODB_URI to its address (see .env.example).`);
  process.exit(1);
}

// First run on an empty database.
//   development: fill in the demo accounts and issues so the site is usable straight away
//   production:  create only the admin (ADMIN_EMAIL / ADMIN_PASSWORD are required), or the demo data when SEED_DEMO=1
//   NO_AUTO_SEED=1: start empty either way
if (!(await hasUsers())) {
  if (process.env.NO_AUTO_SEED) {
    console.warn('No accounts exist yet, so nobody can sign in. Run "npm run seed" first.');
  } else {
    const adminOnly = production && !process.env.SEED_DEMO;
    console.log(adminOnly ? 'First run: creating the admin account...' : 'First run: creating the demo accounts and issues...');
    try {
      console.log(await seedDatabase({ adminOnly }));
    } catch (err) {
      // A SeedError explains what to fix (a missing or weak ADMIN_PASSWORD, an ADMIN_EMAIL outside @nitap.ac.in).
      if (!(err instanceof SeedError)) throw err;
      console.error(err.message);
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
const tidy = () => Promise.all([purgeExpiredSessions(), purgeOldNotifications()]).catch((err) => console.warn(`Tidy-up failed: ${err.message}`));
await tidy();
const sessionCleanup = setInterval(tidy, 3_600_000);
sessionCleanup.unref();

// Automatic backups: daily in production; set BACKUP_EVERY_HOURS to change it, or to 0 to turn them off.
const backupHours = process.env.BACKUP_EVERY_HOURS === undefined ? (production ? 24 : 0) : Number(process.env.BACKUP_EVERY_HOURS);
if (backupHours > 0) {
  scheduleBackups({ dir: backupDir(), uploadDir: uploadDir(), keep: backupKeep() }, backupHours);
  console.log(`Automatic backups every ${backupHours}h into ${backupDir()} (keeping ${backupKeep()}).`);
}

const server = createApp().listen(port, () => {
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
  server.close(async () => {
    try { await disconnectDb(); } catch { /* already closed */ }
    process.exit(0);
  });
  server.closeIdleConnections?.();
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => shutdown(signal));
