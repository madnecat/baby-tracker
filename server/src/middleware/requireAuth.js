import { getUserForToken, SESSION_COOKIE_NAME } from '../auth.js';

export function requireAuth(req, res, next) {
  const token = req.cookies[SESSION_COOKIE_NAME];
  const user = getUserForToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  req.user = user;
  req.sessionToken = token;
  next();
}
