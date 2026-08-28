import crypto from 'node:crypto';

const TOKEN_PREFIX = 'bt_';

export function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function createApiToken(db, userId, label) {
  const rawToken = TOKEN_PREFIX + crypto.randomBytes(32).toString('hex');
  const result = db
    .prepare(`INSERT INTO api_tokens (user_id, label, token_hash) VALUES (?, ?, ?)`)
    .run(userId, label, hashToken(rawToken));
  return { id: result.lastInsertRowid, token: rawToken };
}

export function listApiTokens(db, userId) {
  return db
    .prepare(
      `SELECT id, label, created_at, last_used_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC`
    )
    .all(userId);
}

export function revokeApiToken(db, userId, id) {
  db.prepare(`DELETE FROM api_tokens WHERE id = ? AND user_id = ?`).run(id, userId);
}
