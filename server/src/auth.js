import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from './db.js';

const SESSION_DAYS = 90;

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`).run(
    token,
    userId,
    expiresAt
  );
  return { token, expiresAt };
}

export function deleteSession(token) {
  db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}

export function getUserForToken(token) {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT users.id, users.username, users.display_name AS displayName
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token = ? AND sessions.expires_at > datetime('now')`
    )
    .get(token);
  return row || null;
}

export const SESSION_COOKIE_NAME = 'bt_session';
export const SESSION_COOKIE_MAX_AGE_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
