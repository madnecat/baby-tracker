import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import Database from 'better-sqlite3';
import { runMigrations } from './migrations.js';
import { hashPassword } from './auth.js';
import { requireAuth } from './middleware/requireAuth.js';
import { authRouter } from './routes/auth.js';
import { eventsRouter } from './routes/events.js';
import { growthRouter } from './routes/growth.js';
import { childRouter } from './routes/child.js';
import { apiTokensRouter } from './routes/apiTokens.js';
import { notificationsRouter } from './routes/notifications.js';
import { PrefsError, getUserLanguage, savePrefs } from './notificationsService.js';
import { adminMomRequestEmail, reminderEmail, testEmail } from './emailTemplates.js';

const schemaSql = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'schema.sql'),
  'utf8'
);

function makeDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(schemaSql);
  runMigrations(db);
  const add = db.prepare(`INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)`);
  add.run('mum', 'Mum', hashPassword('right-password'));
  add.run('dad', 'Dad', hashPassword('other'));
  return db;
}

/**
 * Serves `router` with the auth middleware swapped for a fake logged-in user (1 = mum), so the
 * route handlers run for real against an in-memory database. Returns call(method, url, body).
 */
async function serve(mount, router, db, t) {
  router.stack = router.stack.filter((layer) => layer.handle !== requireAuth);
  for (const layer of router.stack) {
    if (layer.route) layer.route.stack = layer.route.stack.filter((l) => l.handle !== requireAuth);
  }
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.db = db;
    req.householdSlug = 'test-house';
    req.user = { id: 1, username: 'mum', displayName: 'Mum' };
    req.sessionToken = 'tok';
    req.cookies = {};
    next();
  });
  app.use(mount, router);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  return async (method, url, body) => {
    const res = await fetch(base + mount + url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
}

function assertError(r, status, code, error) {
  assert.equal(r.status, status);
  assert.equal(r.body.code, code);
  if (error) assert.equal(r.body.error, error);
}

test('requireAuth answers 401 with AUTH_NOT_AUTHENTICATED and the English text', () => {
  let sent;
  const res = {
    status(s) {
      sent = { status: s };
      return this;
    },
    json(b) {
      sent.body = b;
      return this;
    },
  };
  requireAuth({ cookies: {} }, res, () => assert.fail('must not continue'));
  assert.equal(sent.status, 401);
  assert.deepEqual(sent.body, { error: 'Not authenticated', code: 'AUTH_NOT_AUTHENTICATED' });
});

test('auth routes: login and password codes', async (t) => {
  const db = makeDb();
  const call = await serve('/api/auth', authRouter, db, t);
  assertError(await call('POST', '/login', {}), 400, 'AUTH_MISSING_FIELDS', 'username and password are required');
  assertError(
    await call('POST', '/login', { username: 'nobody', password: 'x' }),
    401,
    'AUTH_INVALID_CREDENTIALS',
    'Invalid username or password'
  );
  assertError(await call('PATCH', '/password', {}), 400, 'PASSWORD_FIELDS_REQUIRED');
  assertError(
    await call('PATCH', '/password', { currentPassword: 'nope', newPassword: 'new-password' }),
    401,
    'PASSWORD_WRONG',
    'Current password is incorrect'
  );
  const ok = await call('PATCH', '/password', { currentPassword: 'right-password', newPassword: 'new-password' });
  assert.equal(ok.status, 204);
});

test('events routes: codes for query, validation and not-found errors', async (t) => {
  const db = makeDb();
  const call = await serve('/api/events', eventsRouter, db, t);
  assertError(await call('GET', '/active'), 400, 'EVENT_TYPE_REQUIRED', 'type query param is required');
  const bad = await call('POST', '/', { type: 'nonsense', startedAt: '2026-10-03T10:00:00Z' });
  assertError(bad, 400, 'EVENT_TYPE_INVALID');
  assert.match(bad.body.error, /^type must be one of /);
  assertError(await call('POST', '/', { type: 'diaper' }), 400, 'EVENT_STARTED_AT_REQUIRED', 'startedAt is required');
  assertError(await call('PATCH', '/999', { details: {} }), 404, 'EVENT_NOT_FOUND', 'Event not found');
});

test('growth routes: codes', async (t) => {
  const db = makeDb();
  const call = await serve('/api/growth', growthRouter, db, t);
  assertError(await call('POST', '/', { weightKg: 3 }), 400, 'GROWTH_MEASURED_AT_REQUIRED', 'measuredAt is required');
  assertError(await call('PATCH', '/999', { weightKg: 3 }), 404, 'GROWTH_NOT_FOUND', 'Growth measurement not found');
});

test('child route: CHILD_FIELDS_REQUIRED', async (t) => {
  const db = makeDb();
  const call = await serve('/api/child', childRouter, db, t);
  assertError(
    await call('PUT', '/', { name: '' }),
    400,
    'CHILD_FIELDS_REQUIRED',
    'name, dateOfBirth and sex (male|female) are required'
  );
});

test('api token route: TOKEN_LABEL_REQUIRED', async (t) => {
  const db = makeDb();
  const call = await serve('/api/tokens', apiTokensRouter, db, t);
  assertError(await call('POST', '/', { label: '   ' }), 400, 'TOKEN_LABEL_REQUIRED', 'label is required');
});

test('notifications routes without a mail server', async (t) => {
  const db = makeDb();
  const call = await serve('/api/notifications', notificationsRouter(null), db, t);
  assertError(
    await call('PUT', '/', { enabled: true, email: 'mum@example.com' }),
    409,
    'MAIL_NOT_CONFIGURED',
    'Email reminders are not set up on this server.'
  );
  assertError(await call('POST', '/test'), 409, 'MAIL_NOT_CONFIGURED');
  assertError(
    await call('POST', '/request-mom'),
    409,
    'ADMIN_CONTACT_MISSING',
    'There is no administrator contact set up on this server.'
  );
  assertError(await call('PUT', '/', { email: 'not an email' }), 400, 'EMAIL_INVALID', 'That email address does not look valid.');
  assertError(await call('PUT', '/', { enabled: 'yes' }), 400, 'PREFS_ENABLED_INVALID');
});

test('notifications routes with a mail server', async (t) => {
  const db = makeDb();
  let failSending = false;
  const sent = [];
  const mailer = {
    config: { adminEmail: 'admin@example.com', publicUrl: 'https://baby.example.com' },
    async send(message) {
      if (failSending) throw Object.assign(new Error('smtp down'), { code: 'ECONNREFUSED' });
      sent.push(message);
    },
  };
  const origError = console.error;
  console.error = () => {};
  t.after(() => {
    console.error = origError;
  });
  const call = await serve('/api/notifications', notificationsRouter(mailer), db, t);

  assertError(await call('PUT', '/', { enabled: true }), 400, 'PREFS_EMAIL_REQUIRED', 'Enter an email address first.');
  assertError(await call('POST', '/test'), 400, 'MAIL_EMAIL_NOT_SAVED', 'Save an email address first.');

  assert.equal((await call('PUT', '/', { email: 'mum@example.com' })).status, 200);
  failSending = true;
  assertError(
    await call('POST', '/test'),
    502,
    'MAIL_SEND_FAILED',
    'The test email could not be sent. Check the server mail settings.'
  );
  failSending = false;
  assert.equal((await call('POST', '/test')).status, 204);
  assert.equal((await call('POST', '/test')).status, 204);
  assertError(
    await call('POST', '/test'),
    429,
    'RATE_LIMITED',
    'Too many test emails — try again in an hour.'
  );

  failSending = true;
  assertError(await call('POST', '/request-mom'), 502, 'ADMIN_REQUEST_FAILED', 'The request could not be sent.');
  failSending = false;
  assert.equal((await call('POST', '/request-mom')).status, 204);
  assertError(
    await call('POST', '/request-mom'),
    429,
    'ADMIN_REQUEST_ALREADY_SENT',
    'A request was already sent today.'
  );
  // The administrator is the add-on owner: the request email is always English.
  assert.match(sent.at(-1).subject, /needs Mum to be set up/);

  db.prepare(`INSERT INTO settings (id, mom_user_id) VALUES (1, 1) ON CONFLICT(id) DO UPDATE SET mom_user_id = 1`).run();
  assertError(
    await call('POST', '/request-mom'),
    409,
    'MOM_ALREADY_SET',
    'Mum is already set up for this household.'
  );
});

test('PrefsError carries the code', () => {
  const db = makeDb();
  for (const [patch, code] of [
    [{ email: 'bad' }, 'EMAIL_INVALID'],
    [{ enabled: 1 }, 'PREFS_ENABLED_INVALID'],
    [{ enabled: true }, 'PREFS_EMAIL_REQUIRED'],
  ]) {
    assert.throws(
      () => savePrefs(db, 1, patch),
      (e) => e instanceof PrefsError && e.code === code,
      code
    );
  }
});

test('PATCH /api/auth/language stores the language on the account', async (t) => {
  const db = makeDb();
  const call = await serve('/api/auth', authRouter, db, t);
  assert.equal(db.prepare(`SELECT language FROM users WHERE id = 1`).get().language, null, 'NULL until chosen');
  assertError(await call('PATCH', '/language', { language: 'de' }), 400, 'LANGUAGE_INVALID', 'language must be "en" or "fr".');
  assertError(await call('PATCH', '/language', {}), 400, 'LANGUAGE_INVALID');
  assert.equal(db.prepare(`SELECT language FROM users WHERE id = 1`).get().language, null);
  const ok = await call('PATCH', '/language', { language: 'fr' });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { language: 'fr' });
  assert.equal(db.prepare(`SELECT language FROM users WHERE id = 1`).get().language, 'fr');
  assert.equal(db.prepare(`SELECT language FROM users WHERE id = 2`).get().language, null, 'other users untouched');
  assert.throws(() => db.prepare(`UPDATE users SET language = 'de' WHERE id = 1`).run(), /CHECK/);
});

test('getUserLanguage defaults to English; the test email follows the account language', async (t) => {
  const db = makeDb();
  assert.equal(getUserLanguage(db, 1), 'en');
  db.prepare(`UPDATE users SET language = 'fr' WHERE id = 1`).run();
  assert.equal(getUserLanguage(db, 1), 'fr');

  const sent = [];
  const mailer = { config: { publicUrl: 'https://x.example' }, send: async (m) => sent.push(m) };
  const call = await serve('/api/notifications', notificationsRouter(mailer), db, t);
  await call('PUT', '/', { email: 'mum@example.com' });
  assert.equal((await call('POST', '/test')).status, 204);
  assert.match(sent[0].subject, /email de test/);
  // Older web builds still read and send `language` on the reminder prefs: it is the account
  // language now. A valid one updates the account, an invalid one is rejected as before.
  assert.equal((await call('GET', '/')).body.language, 'fr');
  const put = await call('PUT', '/', { language: 'en' });
  assert.deepEqual(put.body, { email: 'mum@example.com', enabled: false, language: 'en' });
  assert.equal(db.prepare(`SELECT language FROM users WHERE id = 1`).get().language, 'en');
  assertError(await call('PUT', '/', { language: 'de' }), 400, 'LANGUAGE_INVALID', 'language must be "en" or "fr".');
  assert.equal(getUserLanguage(db, 1), 'en', 'an invalid language changes nothing');
  assert.equal((await call('PUT', '/', { email: 'new@example.com' })).body.language, 'en', 'not sending it keeps it');
});

test('migration v6 adds users.language to a v5 database and keeps users', () => {
  const db = makeDb();
  db.prepare(`UPDATE users SET language = 'fr' WHERE id = 2`).run();
  db.exec(`ALTER TABLE users DROP COLUMN language`);
  db.pragma('user_version = 5');
  runMigrations(db);
  assert.equal(db.pragma('user_version', { simple: true }), 6);
  assert.deepEqual(
    db.prepare(`SELECT username, language FROM users ORDER BY id`).all(),
    [
      { username: 'mum', language: null },
      { username: 'dad', language: null },
    ]
  );
});

test('migration v6 keeps a French reminder language chosen in an earlier build', () => {
  const db = makeDb();
  db.prepare(`INSERT INTO notification_prefs (user_id, email, enabled, language, enabled_at) VALUES (1, 'a@b.co', 1, 'fr', '2026-10-01T00:00:00.000Z')`).run();
  db.prepare(`INSERT INTO notification_prefs (user_id, email, enabled, language) VALUES (2, 'c@d.co', 0, 'en')`).run();
  db.exec(`ALTER TABLE users DROP COLUMN language`);
  db.pragma('user_version = 5');
  runMigrations(db);
  assert.deepEqual(
    db.prepare(`SELECT username, language FROM users ORDER BY id`).all(),
    [
      { username: 'mum', language: 'fr' },
      { username: 'dad', language: null },
    ],
    'only a French choice is carried over; the default English stays "not chosen yet"'
  );
});

test('email templates are bilingual and use French typography', () => {
  const fr = reminderEmail({ who: 'baby', language: 'fr', publicUrl: 'https://x.example' });
  assert.ok(fr.subject.includes('Bébé'));
  assert.ok(!/[a-zé] [:;!?]/i.test(fr.subject + fr.text), 'French emails use no-break spaces before : ; ! ?');
  assert.ok(!fr.text.includes('(Settings)') && !fr.text.includes('Email reminders'));
  const frTest = testEmail({ language: 'fr', publicUrl: 'https://x.example' });
  assert.ok(!/[a-zé] [:;!?]/i.test(frTest.subject + frTest.text));
  assert.match(reminderEmail({ who: 'mom', language: 'en' }).text, /Settings > Email reminders/);
  assert.match(adminMomRequestEmail({ householdSlug: 'h', requestedBy: 'Dad' }).subject, /needs Mum/);
});
