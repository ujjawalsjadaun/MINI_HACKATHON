// Saves a copy of the database and photos now. Safe while the site is running.
//   npm run backup
import { backupNow } from '../server/backup.js';
import { openDb } from '../server/db.js';
import { backupDir, backupKeep, dbFile, uploadDir } from '../server/paths.js';

const db = openDb(dbFile());
const { path: saved, removed } = backupNow(db, { dir: backupDir(), uploadDir: uploadDir(), keep: backupKeep() });
console.log(`Backup saved to ${saved}`);
if (removed.length) console.log(`Removed ${removed.length} older backup(s); keeping the newest ${backupKeep()}.`);
db.close();
