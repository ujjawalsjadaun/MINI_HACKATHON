import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Where the data lives. Everything the site must not lose is under these three places.
export const dbFile = () => process.env.DB_FILE || 'data/campusfix.db';
export const uploadDir = () => process.env.UPLOAD_DIR || path.join(root, 'uploads');
export const backupDir = () => process.env.BACKUP_DIR || path.join(path.dirname(path.resolve(dbFile())), 'backups');
export const backupKeep = () => Math.max(1, Number(process.env.BACKUP_KEEP) || 14);
