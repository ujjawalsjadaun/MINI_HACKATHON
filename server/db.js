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
  created_at INTEGER NOT NULL
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
  acknowledged_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_issues_match ON issues(category, location, status);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY,
  issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  description TEXT NOT NULL,
  photo TEXT,
  match_reason TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (issue_id, user_id)
);

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
  return db;
}

// Databases created before a column existed get it on startup.
const ADDED_COLUMNS = {
  issues: [['acknowledged_at', 'INTEGER'], ['acknowledged_by', 'TEXT']],
};

function addMissingColumns(db) {
  for (const [table, columns] of Object.entries(ADDED_COLUMNS)) {
    const have = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
    for (const [name, type] of columns) {
      if (!have.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
    }
  }
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
