import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'staff', 'admin')),
  department TEXT,
  created_at INTEGER NOT NULL,
  security_question TEXT,
  security_hash TEXT,
  security_salt TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

-- One row per underlying problem. Many student reports can point at one issue.
CREATE TABLE IF NOT EXISTS issues (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  location TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  department TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'in_progress', 'awaiting_confirmation', 'resolved')),
  assigned_to TEXT,
  assigned_user_id INTEGER REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  resolved_at INTEGER,
  reopen_count INTEGER NOT NULL DEFAULT 0,
  acknowledged_at INTEGER,
  acknowledged_by TEXT,
  pin_x REAL,
  pin_y REAL
);
CREATE INDEX IF NOT EXISTS idx_issues_match ON issues(category, location, status);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY,
  issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  description TEXT NOT NULL,
  photo TEXT,
  match_reason TEXT,
  urgency TEXT NOT NULL DEFAULT 'normal',
  created_at INTEGER NOT NULL,
  UNIQUE (issue_id, user_id)
);

-- A student's rating of a resolved issue's fix (1 to 5), one per student per issue, editable.
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY,
  issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (issue_id, user_id)
);

-- Alerts for the people an issue concerns. Stored as a kind plus details so they can be shown in any language.
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  params TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, created_at);

CREATE TABLE IF NOT EXISTS status_log (
  id INTEGER PRIMARY KEY,
  issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;

export function openDb(file = process.env.DB_FILE || 'data/campusfix.db') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  addMissingColumns(db);
  moveDemoAccounts(db);
  return db;
}

// Databases created before a column existed get it on startup.
const ADDED_COLUMNS = {
  reports: [['urgency', "TEXT NOT NULL DEFAULT 'normal'"]],
  users: [['security_question', 'TEXT'], ['security_hash', 'TEXT'], ['security_salt', 'TEXT'], ['active', 'INTEGER NOT NULL DEFAULT 1']],
  issues: [['acknowledged_at', 'INTEGER'], ['acknowledged_by', 'TEXT'], ['pin_x', 'REAL'], ['pin_y', 'REAL']],
};

function addMissingColumns(db) {
  for (const [table, columns] of Object.entries(ADDED_COLUMNS)) {
    const have = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
    for (const [name, type] of columns) {
      if (!have.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
    }
  }
}

// Sign-in now needs an @nitap.ac.in address. Demo accounts seeded before that rule used @campusfix.local;
// move them across so an existing database keeps working (asha@campusfix.local becomes asha@nitap.ac.in).
function moveDemoAccounts(db) {
  db.exec("UPDATE OR IGNORE users SET email = replace(email, '@campusfix.local', '@nitap.ac.in') WHERE email LIKE '%@campusfix.local'");
}

export function purgeExpiredSessions(db, now = Date.now()) {
  return Number(db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now).changes);
}

// Notifications older than this many days are no longer useful and are removed.
export function purgeOldNotifications(db, days = 90, now = Date.now()) {
  return Number(db.prepare('DELETE FROM notifications WHERE created_at < ?').run(now - days * 86_400_000).changes);
}

// node:sqlite has no transaction helper; this keeps multi-statement writes atomic.
export function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
