import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { runMigrations } from './migrations.js';
import { collectDueReminders, processHousehold, runReminderTick } from './reminders.js';
import { reminderEmail } from './emailTemplates.js';
import { PrefsError, createRateLimiter, getPrefs, isValidEmail, savePrefs } from './notificationsService.js';

const schemaSql = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'schema.sql'),
  'utf8'
);

const NOW = Date.parse('2026-10-03T12:00:00.000Z');
const minutes = (n) => n * 60000;
const iso = (ms) => new Date(ms).toISOString();

function makeDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(schemaSql);
  runMigrations(db);
  const addUser = db.prepare(`INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, 'x')`);
  addUser.run('mum', 'Mum');
  addUser.run('dad', 'Dad');
  return db; // users: 1 = mum, 2 = dad
}

function addDose(db, { name = 'Ibuprofen', who, dueInMin, intervalHours = 6, startedAt } = {}) {
  const started = startedAt ?? iso(NOW + minutes(dueInMin) - intervalHours * 3600000);
  const details = { name, intervalHours, ...(who ? { who } : {}) };
  return db
    .prepare(`INSERT INTO events (type, started_at, ended_at, details, created_by) VALUES ('medication', ?, ?, ?, 1)`)
    .run(started, started, JSON.stringify(details)).lastInsertRowid;
}

function enable(db, userId, { email = `u${userId}@example.com`, language = 'en', at = NOW - minutes(600) } = {}) {
  savePrefs(db, userId, { enabled: true, email, language }, new Date(at));
}

function setMom(db, userId) {
  db.prepare(`INSERT INTO settings (id, mom_user_id) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET mom_user_id = excluded.mom_user_id`).run(userId);
}

const recipientIds = (reminders) => reminders.flatMap((r) => r.recipients.map((x) => x.userId)).sort();

test('fresh and migrated databases both end up at the latest schema', () => {
  const db = makeDb();
  const cols = db.prepare(`PRAGMA table_info(settings)`).all().map((c) => c.name);
  assert.ok(cols.includes('mom_user_id') && cols.includes('hide_baby_medication'));
  assert.equal(db.pragma('user_version', { simple: true }), 4);
});

test('nothing is sent while nobody has enabled reminders', () => {
  const db = makeDb();
  addDose(db, { who: 'baby', dueInMin: -1 });
  assert.deepEqual(collectDueReminders(db, NOW), []);
});

test('a dose that just came due reminds; not before it is due, not after the window', () => {
  const db = makeDb();
  enable(db, 2);
  const early = addDose(db, { name: 'A', who: 'baby', dueInMin: 5 });
  const justDue = addDose(db, { name: 'B', who: 'baby', dueInMin: -1 });
  const stale = addDose(db, { name: 'C', who: 'baby', dueInMin: -31 });
  const ids = collectDueReminders(db, NOW).map((r) => r.eventId);
  assert.deepEqual(ids, [Number(justDue)]);
  assert.ok(!ids.includes(Number(early)) && !ids.includes(Number(stale)));
});

test("Baby's doses go to every parent with reminders on; others are skipped", () => {
  const db = makeDb();
  enable(db, 1);
  enable(db, 2);
  addDose(db, { who: 'baby', dueInMin: -1 });
  assert.deepEqual(recipientIds(collectDueReminders(db, NOW)), [1, 2]);

  savePrefs(db, 2, { enabled: false });
  assert.deepEqual(recipientIds(collectDueReminders(db, NOW)), [1]);
});

test("Mum's doses go to Mum only — and to nobody when Mum isn't configured", () => {
  const db = makeDb();
  enable(db, 1);
  enable(db, 2);
  addDose(db, { who: 'mom', dueInMin: -1 });
  assert.deepEqual(collectDueReminders(db, NOW), []);

  setMom(db, 1);
  assert.deepEqual(recipientIds(collectDueReminders(db, NOW)), [1]);
});

test("legacy doses without `who` are Mum's", () => {
  const db = makeDb();
  enable(db, 1);
  enable(db, 2);
  setMom(db, 1);
  addDose(db, { dueInMin: -1 });
  assert.deepEqual(recipientIds(collectDueReminders(db, NOW)), [1]);
});

test('doses that fell due before a parent enabled reminders never email them', () => {
  const db = makeDb();
  enable(db, 2, { at: NOW }); // enabled just now
  addDose(db, { who: 'baby', dueInMin: -1 }); // fell due a minute ago, before that
  assert.deepEqual(collectDueReminders(db, NOW), []);
  addDose(db, { name: 'Later', who: 'baby', dueInMin: 0 });
  assert.equal(collectDueReminders(db, NOW).length, 1);
});

test('a newer dose of the same medication supersedes the older one (name match ignores case/spaces)', () => {
  const db = makeDb();
  enable(db, 2);
  addDose(db, { name: 'Vitamin D', who: 'baby', dueInMin: -1 });
  addDose(db, { name: ' vitamin d ', who: 'baby', dueInMin: 200 });
  assert.deepEqual(collectDueReminders(db, NOW), []);
});

test("Mum's and Baby's doses of the same name don't supersede each other", () => {
  const db = makeDb();
  enable(db, 1);
  enable(db, 2);
  setMom(db, 1);
  addDose(db, { name: 'Paracetamol', who: 'baby', dueInMin: -1 });
  addDose(db, { name: 'Paracetamol', who: 'mom', dueInMin: 100 });
  assert.equal(collectDueReminders(db, NOW).length, 1);
});

test('unusable intervals never remind', () => {
  const db = makeDb();
  enable(db, 2);
  for (const interval of [0, -2, null, 'six', 169, 1e12, undefined]) {
    addDose(db, { who: 'baby', name: `n${interval}`, intervalHours: interval, startedAt: iso(NOW - minutes(1)) });
  }
  addDose(db, { who: 'baby', name: 'bad-date', startedAt: 'not a date' });
  assert.deepEqual(collectDueReminders(db, NOW), []);
});

test('mailing marks the reminder sent, so it is never repeated; failures retry with backoff', async () => {
  const db = makeDb();
  enable(db, 2, { language: 'fr' });
  const id = addDose(db, { who: 'baby', dueInMin: -1 });
  const sent = [];
  let fail = true;
  const mailer = {
    send: async (m) => {
      if (fail) throw Object.assign(new Error('boom to a@b.c'), { code: 'ECONNECTION' });
      sent.push(m);
    },
  };
  const logs = [];
  const log = { log: (m) => logs.push(m), error: (m) => logs.push(m) };
  const retries = new Map();
  const run = (nowMs) =>
    processHousehold({ slug: 'h', db, mailer, publicUrl: 'https://baby.example', nowMs, retries, log });

  await run(NOW); // fails
  assert.equal(sent.length, 0);
  await run(NOW + 1000); // still backing off: not even attempted
  assert.equal(logs.filter((l) => l.includes('failed')).length, 1);
  assert.ok(logs.every((l) => !l.includes('a@b.c') && !l.includes('u2@example.com')), 'no address in logs');

  fail = false;
  await run(NOW + minutes(5)); // back-off over, server back
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'u2@example.com');
  assert.match(sent[0].subject, /Bébé/);
  assert.match(sent[0].text, /https:\/\/baby\.example/);
  assert.ok(!/Ibuprofen/.test(sent[0].text + sent[0].subject), 'no medication name in the email');

  await run(NOW + minutes(6));
  assert.equal(sent.length, 1, 'sent exactly once');
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM medication_reminders WHERE event_id = ?`).get(id).n, 1);
});

test('editing the dose time re-arms the reminder; deleting the dose drops it', async () => {
  const db = makeDb();
  enable(db, 2);
  const id = addDose(db, { who: 'baby', dueInMin: -1 });
  const sent = [];
  const mailer = { send: async (m) => sent.push(m) };
  const retries = new Map();
  const log = { log() {}, error() {} };
  const run = (nowMs) => processHousehold({ slug: 'h', db, mailer, nowMs, retries, log });

  await run(NOW);
  assert.equal(sent.length, 1);

  // Moved 3 hours later: new due time, new reminder when it arrives.
  db.prepare(`UPDATE events SET started_at = ? WHERE id = ?`).run(iso(Date.parse(db.prepare(`SELECT started_at FROM events WHERE id = ?`).get(id).started_at) + 3 * 3600000), id);
  await run(NOW + 3 * 3600000);
  assert.equal(sent.length, 2);

  db.prepare(`DELETE FROM events WHERE id = ?`).run(id);
  await run(NOW + 3 * 3600000 + minutes(1));
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM medication_reminders`).get().n, 0, 'orphans purged');
});

test("one household's failure doesn't stop the others", async () => {
  const good = makeDb();
  enable(good, 2);
  addDose(good, { who: 'baby', dueInMin: -1 });
  const broken = { prepare: () => { throw new Error('corrupt'); } };
  const sent = [];
  const log = { log() {}, error() {} };
  await runReminderTick({
    getHouseholds: () => [{ slug: 'bad', db: broken }, { slug: 'good', db: good }],
    mailer: { send: async (m) => sent.push(m) },
    retries: new Map(),
    nowMs: NOW,
    log,
  });
  assert.equal(sent.length, 1);
});

test('email text is neutral and localised', () => {
  const en = reminderEmail({ who: 'mom', language: 'en', publicUrl: 'https://x.test' });
  assert.match(en.subject, /Mum/);
  const fr = reminderEmail({ who: 'mom', language: 'fr', publicUrl: null });
  assert.match(fr.subject, /Maman/);
  assert.ok(!fr.text.includes('null') && !fr.text.includes('undefined'));
});

test('preferences: validation, enabling stamps enabled_at, clearing the address disables', () => {
  const db = makeDb();
  assert.throws(() => savePrefs(db, 1, { enabled: true, email: 'nope' }), PrefsError);
  assert.throws(() => savePrefs(db, 1, { email: 'a@b.co\r\nBcc: x@y.z' }), PrefsError);
  assert.throws(() => savePrefs(db, 1, { language: 'de' }), PrefsError);
  assert.throws(() => savePrefs(db, 1, { enabled: true }), /email address first/);

  const at = new Date('2026-10-03T10:00:00.000Z');
  savePrefs(db, 1, { enabled: true, email: 'mum@example.com', language: 'fr' }, at);
  assert.deepEqual(getPrefs(db, 1), { email: 'mum@example.com', enabled: true, language: 'fr' });
  savePrefs(db, 1, { language: 'en' }, new Date('2026-10-03T11:00:00.000Z')); // unrelated change
  assert.equal(
    db.prepare(`SELECT enabled_at FROM notification_prefs WHERE user_id = 1`).get().enabled_at,
    at.toISOString(),
    'enabled_at only moves when reminders are switched on'
  );
  assert.equal(savePrefs(db, 1, { email: '' }).enabled, false);
  assert.ok(isValidEmail('a.b+c@sub.example.fr') && !isValidEmail('a@b') && !isValidEmail('x'.repeat(250) + '@a.bc'));
});

test('rate limiter allows N per window', () => {
  const allow = createRateLimiter(2, 1000);
  assert.ok(allow('k', 0) && allow('k', 10) && !allow('k', 20) && allow('other', 20) && allow('k', 2000));
});

test('a delivered email whose record fails to save is not retried (no duplicate emails)', async () => {
  const real = makeDb();
  enable(real, 2);
  addDose(real, { who: 'baby', dueInMin: -1 });
  const db = new Proxy(real, {
    get(target, prop) {
      if (prop === 'prepare') {
        return (sql) => {
          if (/INSERT OR IGNORE INTO medication_reminders/.test(sql)) throw new Error('SQLITE_BUSY');
          return target.prepare(sql);
        };
      }
      const value = target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const sent = [];
  const mailer = { send: async (m) => sent.push(m) };
  const retries = new Map();
  const log = { log() {}, error() {} };
  for (const t of [0, 61000, 5 * 60000, 10 * 60000]) {
    await processHousehold({ slug: 'h', db, mailer, nowMs: NOW + t, retries, log });
  }
  assert.equal(sent.length, 1);
});

test('enabled must be a real boolean', () => {
  const db = makeDb();
  assert.throws(() => savePrefs(db, 1, { enabled: 'true', email: 'a@b.co' }), PrefsError);
});
