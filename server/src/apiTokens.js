import crypto from 'node:crypto';
import { db } from './db.js';

const TOKEN_PREFIX = 'bt_';

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function createApiToken(userId, label) {
  const rawToken = TOKEN_PREFIX + crypto.randomBytes(32).toString('hex');
  const result = db
    .prepare(`INSERT INTO api_tokens (user_id, label, token_hash) VALUES (?, ?, ?)`)
    .run(userId, label, hashToken(rawToken));
  return { id: result.lastInsertRowid, token: rawToken };
}

export function listApiTokens(userId) {
  return db
    .prepare(
      `SELECT id, label, created_at, last_used_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC`
    )
    .all(userId);
}

export function revokeApiToken(userId, id) {
  db.prepare(`DELETE FROM api_tokens WHERE id = ? AND user_id = ?`).run(id, userId);
}

/** Returns { id, username, displayName } for a valid raw token, or null. */
export function getUserForApiToken(rawToken) {
  const row = db
    .prepare(
      `SELECT users.id, users.username, users.display_name AS displayName, api_tokens.id AS tokenId
       FROM api_tokens
       JOIN users ON users.id = api_tokens.user_id
       WHERE api_tokens.token_hash = ?`
    )
    .get(hashToken(rawToken));
  if (!row) return null;
  db.prepare(`UPDATE api_tokens SET last_used_at = datetime('now') WHERE id = ?`).run(row.tokenId);
  return { id: row.id, username: row.username, displayName: row.displayName };
}
