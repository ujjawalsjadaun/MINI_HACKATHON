import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lanAddresses } from './network.js';

const port = Number(process.env.PORT) || 3000;

// node:sqlite needs a recent Node; explain that instead of crashing with an obscure import error.
let openDb, createApp;
try {
  ({ openDb } = await import('./db.js'));
  ({ createApp } = await import('./app.js'));
} catch (err) {
  if (err.code === 'ERR_UNKNOWN_BUILTIN_MODULE') {
    console.error(`UniSeva Portal needs Node.js 22.13 or newer (found ${process.version}). Install it from https://nodejs.org and try again.`);
    process.exit(1);
  }
  throw err;
}

const db = openDb();
// First run on a new computer: fill in the demo accounts and issues so the site is usable straight away.
// Set NO_AUTO_SEED=1 to start with an empty database instead.
if (!db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
  if (process.env.NO_AUTO_SEED) {
    console.warn('No accounts exist yet, so nobody can sign in. Run "npm run seed" first.');
  } else {
    console.log('First run: creating the demo accounts and issues...');
    try {
      execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/seed.js', import.meta.url))], { stdio: 'inherit' });
    } catch {
      // The seed explains what went wrong (for example an ADMIN_EMAIL outside @nitap.ac.in); keep serving
      // rather than crash, so a restart loop does not hide the message.
      console.warn('The demo data could not be created (see above). The site is running, but nobody can sign in yet.');
    }
  }
}

const server = createApp(db).listen(port, () => {
  console.log('UniSeva Portal, designed and developed by Ujjawal Singh');
  console.log(`UniSeva Portal running at http://localhost:${port}`);
  for (const { address } of lanAddresses()) console.log(`On your network:        http://${address}:${port}`);
});
server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`Port ${port} is already in use. Stop the other server or run with a different port, e.g. PORT=3001 npm start.`);
  process.exit(1);
});
