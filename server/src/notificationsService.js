import { normaliseLanguage } from './emailTemplates.js';

const MAX_EMAIL_LENGTH = 254;
// Deliberately conservative: one address, no whitespace/control characters (blocks header
// injection), no display-name or list syntax.
const EMAIL_PATTERN = /^[^\s@<>(),;:"\\]+@[^\s@<>(),;:"\\]+\.[^\s@<>(),;:"\\]+$/;

export function isValidEmail(email) {
  return typeof email === 'string' && email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email);
}

export class PrefsError extends Error {}

export function getPrefs(db, userId) {
  const row = db
    .prepare(`SELECT email, enabled, language FROM notification_prefs WHERE user_id = ?`)
    .get(userId);
  return {
    email: row?.email ?? '',
    enabled: !!row?.enabled,
    language: normaliseLanguage(row?.language),
  };
}

export function getMomUserId(db) {
  return db.prepare(`SELECT mom_user_id AS id FROM settings WHERE id = 1`).get()?.id ?? null;
}

/**
 * Validates and stores a parent's own reminder preferences. Switching reminders on records
 * `enabled_at`, so doses that fell due before that moment never trigger an email. Clearing the
 * address switches reminders off.
 */
export function savePrefs(db, userId, patch, now = new Date()) {
  const current = getPrefs(db, userId);

  const email = patch.email === undefined ? current.email : String(patch.email).trim();
  if (email !== '' && !isValidEmail(email)) throw new PrefsError('That email address does not look valid.');

  if (patch.language !== undefined && patch.language !== 'en' && patch.language !== 'fr') {
    throw new PrefsError('language must be "en" or "fr".');
  }
  const language = patch.language === undefined ? current.language : patch.language;

  let enabled = patch.enabled === undefined ? current.enabled : patch.enabled === true;
  if (patch.enabled === true && email === '') throw new PrefsError('Enter an email address first.');
  if (email === '') enabled = false; // clearing the address turns reminders off

  const enabledAt = enabled ? (current.enabled ? undefined : now.toISOString()) : null;
  db.prepare(
    `INSERT INTO notification_prefs (user_id, email, enabled, language, enabled_at)
     VALUES (@userId, @email, @enabled, @language, @enabledAt)
     ON CONFLICT(user_id) DO UPDATE SET
       email = excluded.email,
       enabled = excluded.enabled,
       language = excluded.language,
       enabled_at = CASE WHEN @keepEnabledAt THEN notification_prefs.enabled_at ELSE excluded.enabled_at END`
  ).run({
    userId,
    email,
    enabled: enabled ? 1 : 0,
    language,
    enabledAt: enabledAt ?? null,
    keepEnabledAt: enabledAt === undefined ? 1 : 0,
  });
  return getPrefs(db, userId);
}

/** Tiny in-memory limiter: at most `max` hits per `windowMs` for a key (resets on restart). */
export function createRateLimiter(max, windowMs) {
  const hits = new Map();
  return function allow(key, now = Date.now()) {
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
}
