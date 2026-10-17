// Puts a backup back. STOP THE SITE FIRST.
//   npm run restore                             lists the backups
//   npm run restore -- backup-20261009-020000   restores that one
// What it replaces is saved first, in a "before-restore-<time>" folder next to the backups.
import path from 'node:path';
import { backupDir, uploadDir } from '../src/config/env.js';
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { listBackups, restoreBackup } from '../src/services/backup.js';

const dir = backupDir();
const [which] = process.argv.slice(2);
const all = listBackups(dir);

if (!which) {
  console.log(all.length ? `Backups in ${dir} (oldest first):\n  ${all.join('\n  ')}\n\nRestore one with: npm run restore -- <name>` : `No backups found in ${dir}.`);
  process.exit(0);
}

const source = all.includes(which) ? path.join(dir, which) : path.resolve(which);
try {
  await connectDb();
  const { previous } = await restoreBackup({ source, uploadDir: uploadDir(), saveDir: dir });
  console.log(`Restored ${source}\n  what it replaced is kept in ${previous}\nStart the site again.`);
  await disconnectDb();
} catch (err) {
  console.error(`Could not restore: ${err.message}`);
  await disconnectDb().catch(() => {});
  process.exit(1);
}
