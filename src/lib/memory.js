import crypto from 'node:crypto';
import { db } from '../db.js';

export function hashContent(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

const stmtFindByHash = db.prepare('SELECT id FROM inputs WHERE content_hash = ?');
const stmtInsertInput = db.prepare(
  `INSERT INTO inputs (source, raw_content, content_hash, metadata) VALUES (?, ?, ?, ?)`
);
const stmtInsertAction = db.prepare(
  `INSERT INTO actions (input_id, action_type, payload, status) VALUES (?, ?, ?, 'pending')`
);
const stmtSucceedAction = db.prepare(
  `UPDATE actions SET status = 'success', external_id = ? WHERE id = ?`
);
const stmtFailAction = db.prepare(
  `UPDATE actions SET status = 'failed', error = ? WHERE id = ?`
);
const stmtInsertNote = db.prepare(`INSERT INTO notes (content, tags) VALUES (?, ?)`);
const stmtRecentInputs = db.prepare(
  `SELECT id, source, raw_content, metadata, created_at
     FROM inputs
    WHERE created_at >= datetime('now', ?)
    ORDER BY created_at DESC`
);

/**
 * Insert an input. Idempotent: if content_hash already exists, returns existing id.
 */
export function recordInput({ source, content, metadata }) {
  const hash = hashContent(content);
  const existing = stmtFindByHash.get(hash);
  if (existing) return { id: existing.id, duplicate: true };
  const result = stmtInsertInput.run(
    source,
    content,
    hash,
    metadata ? JSON.stringify(metadata) : null
  );
  return { id: result.lastInsertRowid, duplicate: false };
}

export function recordAction({ inputId, type, payload }) {
  const result = stmtInsertAction.run(inputId, type, JSON.stringify(payload));
  return result.lastInsertRowid;
}

export function markActionSuccess(actionId, externalId) {
  stmtSucceedAction.run(externalId ?? null, actionId);
}

export function markActionFailed(actionId, err) {
  const message = err && err.message ? err.message : String(err);
  stmtFailAction.run(message, actionId);
}

export function recordNote({ content, tags }) {
  const result = stmtInsertNote.run(content, tags ?? null);
  return result.lastInsertRowid;
}

export function recentInputs(hours = 24) {
  return stmtRecentInputs.all(`-${hours} hours`);
}
