import { SESSION_COOKIE_NAME } from '../auth.js';
import { findHouseholdBySessionToken } from '../households.js';

export function requireAuth(req, res, next) {
  const token = req.cookies[SESSION_COOKIE_NAME];
  const found = token ? findHouseholdBySessionToken(token) : null;
  if (!found) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  req.db = found.db;
  req.user = found.result;
  req.sessionToken = token;
  next();
}
