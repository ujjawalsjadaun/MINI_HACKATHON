// Saves a copy of the database and photos now. Safe while the site is running.
//   npm run backup
import { backupDir, backupKeep, uploadDir } from '../src/config/env.js';
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { backupNow } from '../src/services/backup.js';

await connectDb();
const { path: saved, removed } = await backupNow({ dir: backupDir(), uploadDir: uploadDir(), keep: backupKeep() });
console.log(`Backup saved to ${saved}`);
if (removed.length) console.log(`Removed ${removed.length} older backup(s); keeping the newest ${backupKeep()}.`);
await disconnectDb();
