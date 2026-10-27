import { Router } from 'express';
import {
  verifyPassword,
  hashPassword,
  createSession,
  deleteSession,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE_MS,
} from '../auth.js';
import { findHouseholdByUsername } from '../households.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required', code: 'AUTH_MISSING_FIELDS' });
  }

  const found = findHouseholdByUsername(username);
  if (!found || !verifyPassword(password, found.result.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password', code: 'AUTH_INVALID_CREDENTIALS' });
  }

  const { token } = createSession(found.db, found.result.id);
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: SESSION_COOKIE_MAX_AGE_MS,
  });
  res.json({
    id: found.result.id,
    username: found.result.username,
    displayName: found.result.display_name,
    language: found.result.language ?? null,
    theme: found.result.theme ?? null,
  });
});

authRouter.post('/logout', requireAuth, (req, res) => {
  deleteSession(req.db, req.sessionToken);
  res.clearCookie(SESSION_COOKIE_NAME);
  res.status(204).end();
});

authRouter.get('/session', requireAuth, (req, res) => {
  res.json(req.user);
});

// The person's app language (en | fr). It is stored on their account so every device and their
// reminder emails follow it. Cookie sessions only: API tokens never reach this router's auth.
authRouter.patch('/language', requireAuth, (req, res) => {
  const { language } = req.body || {};
  if (language !== 'en' && language !== 'fr') {
    return res.status(400).json({ error: 'language must be "en" or "fr".', code: 'LANGUAGE_INVALID' });
  }
  req.db.prepare(`UPDATE users SET language = ? WHERE id = ?`).run(language, req.user.id);
  res.json({ language });
});

// The person's colour theme: "light", "dark", or null to follow each device's own setting.
// Stored on the account so it follows them to every device, like the language.
authRouter.patch('/theme', requireAuth, (req, res) => {
  const { theme } = req.body || {};
  if (theme !== 'light' && theme !== 'dark' && theme !== null) {
    return res.status(400).json({ error: 'theme must be "light", "dark" or null.', code: 'THEME_INVALID' });
  }
  req.db.prepare(`UPDATE users SET theme = ? WHERE id = ?`).run(theme, req.user.id);
  res.json({ theme });
});

authRouter.patch('/password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword and newPassword are required', code: 'PASSWORD_FIELDS_REQUIRED' });
  }
  const user = req.db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  if (!verifyPassword(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect', code: 'PASSWORD_WRONG' });
  }
  req.db
    .prepare(`UPDATE users SET password_hash = ? WHERE id = ?`)
    .run(hashPassword(newPassword), req.user.id);
  res.status(204).end();
});
