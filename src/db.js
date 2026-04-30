import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = config.DB_PATH || path.join(process.cwd(), 'brain.db');
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run migrations at import time so any module that prepares statements at the
// top level can safely assume the schema exists. Migrations are idempotent —
// already-applied files are skipped via the _migrations tracking table.
runMigrations();

export function runMigrations() {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const applied = new Set(
    db.prepare('SELECT name FROM _migrations').all().map((r) => r.name)
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
    });
    tx();
    console.log(`Applied migration: ${file}`);
    count++;
  }
  if (count === 0) console.log('No new migrations to apply.');
  return count;
}

if (process.argv[1] === __filename && process.argv[2] === 'migrate') {
  runMigrations();
  process.exit(0);
}
