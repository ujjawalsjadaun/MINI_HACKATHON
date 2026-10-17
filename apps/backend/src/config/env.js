import path from 'node:path';
import { fileURLToPath } from 'node:url';

// apps/backend/src/config -> the backend app, and the repository root two levels above it.
export const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const repoRoot = path.resolve(backendRoot, '../..');

// Where things live. Read from the environment each time, so tests and hosts can change them.
export const mongoUri = () => process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/uniseva';

// Everything the site must not lose is the database plus these two folders.
export const uploadDir = () => process.env.UPLOAD_DIR || path.join(repoRoot, 'uploads');
export const backupDir = () => process.env.BACKUP_DIR || path.join(repoRoot, 'data', 'backups');
export const backupKeep = () => Math.max(1, Number(process.env.BACKUP_KEEP) || 14);

// The built React app (apps/frontend/dist). The API serves it, so one process is one deployment.
export const frontendDist = () => process.env.FRONTEND_DIST || path.join(repoRoot, 'apps', 'frontend', 'dist');

// The institute's private emergency directory (git-ignored); see the README.
export const emergencyFile = () => process.env.EMERGENCY_FILE || path.join(repoRoot, 'private', 'emergency-contacts.json');

export const isProduction = () => process.env.NODE_ENV === 'production';
