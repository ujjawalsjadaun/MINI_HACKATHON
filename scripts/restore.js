// Puts a backup back. STOP THE SITE FIRST.
//   npm run restore                     lists the backups
//   npm run restore -- backup-20261009-020000   restores that one
// The current database and photos are kept next to the originals as "*.before-restore-<time>".
import path from 'node:path';
import { listBackups, restoreBackup } from '../server/backup.js';
import { backupDir, dbFile, uploadDir } from '../server/paths.js';

const dir = backupDir();
const [which] = process.argv.slice(2);
const all = listBackups(dir);

if (!which) {
  console.log(all.length ? `Backups in ${dir} (oldest first):\n  ${all.join('\n  ')}\n\nRestore one with: npm run restore -- <name>` : `No backups found in ${dir}.`);
  process.exit(0);
}

const source = all.includes(which) ? path.join(dir, which) : path.resolve(which);
try {
  const { database, previous } = restoreBackup({ source, dbFile: path.resolve(dbFile()), uploadDir: uploadDir() });
  console.log(`Restored ${source}\n  database: ${database}\n  the database it replaced is kept as ${previous}\nStart the site again.`);
} catch (err) {
  console.error(`Could not restore: ${err.message}`);
  process.exit(1);
}
