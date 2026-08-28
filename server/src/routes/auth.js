import { Router } from 'express';
import { db } from '../db.js';
import {
  verifyPassword,
  hashPassword,
  createSession,
  deleteSession,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE_MS,
} from '../auth.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const user = db.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const { token } = createSession(user.id);
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: SESSION_COOKIE_MAX_AGE_MS,
  });
  res.json({ id: user.id, username: user.username, displayName: user.display_name });
});

authRouter.post('/logout', requireAuth, (req, res) => {
  deleteSession(req.sessionToken);
  res.clearCookie(SESSION_COOKIE_NAME);
  res.status(204).end();
});

authRouter.get('/session', requireAuth, (req, res) => {
  res.json(req.user);
});

authRouter.patch('/password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword and newPassword are required' });
  }
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  if (!verifyPassword(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(
    hashPassword(newPassword),
    req.user.id
  );
  res.status(204).end();
});
