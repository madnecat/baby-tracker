// Upgrade safety net: a database as it exists in production (commit baede2d, schema user_version 2)
// - and the intermediate dev-build states v3, v4, v5 - must open with the CURRENT code losslessly.
//
// The households are real files under a temporary DATA_DIR and are opened through the real
// households.js (getHouseholdDb = apply schema.sql, then runMigrationsForAllHouseholds(runMigrations)),
// i.e. exactly the boot sequence of index.js. The historical schemas are frozen copies in
// fixtures/schema-v*.sql (git show <commit>:server/schema.sql) - never edit them.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import express from 'express';
import cookieParser from 'cookie-parser';

import { hashPassword, verifyPassword } from './auth.js';
import { hashToken } from './apiTokens.js';
import { populateProductionRows, FIXTURE_DOSE } from './fixtures/productionData.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => fs.readFileSync(path.join(here, 'fixtures', name), 'utf8');
const currentSchemaSql = fs.readFileSync(path.join(here, '..', 'schema.sql'), 'utf8');

// households.js reads these at import time, so set them before importing anything that uses it.
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-upgrade-'));
process.env.DATA_DIR = DATA_DIR;
process.env.DB_PATH = path.join(DATA_DIR, 'legacy-does-not-exist.db');

const households = await import('./households.js');
const { runMigrations } = await import('./migrations.js');
const { listEvents } = await import('./eventsService.js');
const { getSettings } = await import('./settingsService.js');
const { getChild } = await import('./childService.js');
const { listGrowthMeasurements } = await import('./growthService.js');
const { getMilestoneCompletions } = await import('./milestonesService.js');
const { listApiTokens } = await import('./apiTokens.js');
const { getUserLanguage, getMomUserId, savePrefs } = await import('./notificationsService.js');
const { collectDueReminders } = await import('./reminders.js');
const { authRouter } = await import('./routes/auth.js');

// ------------------------------------------------------------------ scenarios

// `schema` is the frozen schema.sql of that build; `version` the user_version it had reached.
const SCENARIOS = [
  { slug: 'prod', schema: 'schema-v2-production.sql', version: 2, label: 'production (baede2d, v2)' },
  { slug: 'dev3', schema: 'schema-v3.sql', version: 3, label: 'dev build v3', extras: (db) => {
    db.exec(`UPDATE settings SET hide_baby_medication = 1`);
  } },
  { slug: 'dev4', schema: 'schema-v4.sql', version: 4, label: 'dev build v4', extras: (db) => {
    db.exec(`UPDATE settings SET hide_baby_medication = 1, mom_user_id = 2`);
    db.exec(`INSERT INTO notification_prefs (user_id, email, enabled, language, enabled_at)
             VALUES (1, 'alice@example.test', 1, 'fr', '2026-09-01T00:00:00.000Z'), (2, '', 0, 'en', NULL)`);
    db.exec(`INSERT INTO medication_reminders (event_id, user_id, due_at, sent_at)
             VALUES (1, 1, '2026-09-20T14:00:00.000Z', '2026-09-20T14:00:30.000Z')`);
  } },
  { slug: 'dev5', schema: 'schema-v5.sql', version: 5, label: 'dev build v5', extras: (db) => {
    db.exec(`UPDATE settings SET hide_baby_medication = 1, mom_user_id = 1, feed_prompt = 0`);
    db.exec(`INSERT INTO notification_prefs (user_id, email, enabled, language, enabled_at)
             VALUES (2, 'bob@example.test', 1, 'en', '2026-09-02T00:00:00.000Z')`);
  } },
  // columns already present although user_version is lower (restored/hand-fixed DB): the ALTERs
  // must be guarded, not crash with "duplicate column name".
  { slug: 'cols-ahead', schema: 'schema-v5.sql', version: 2, label: 'v5 columns but user_version 2' },
];

const ORIGINAL_USER_VERSION = { prod: 2, dev3: 3, dev4: 4, dev5: 5, 'cols-ahead': 2 };

function dbFile(slug) {
  return path.join(DATA_DIR, 'households', slug, 'data.db');
}

const PASSWORDS = ['alice-secret-pw', 'bob-other-pw'];
let hashes;
let validExpiry;
let expiredExpiry;
const before_ = {}; // slug -> { dump, columns, indexes, services, sequences, version }
const upgradeLogs = {};
let freshInfo;

function dumpAll(db, tablesWithColumns) {
  const out = {};
  for (const [table, columns] of Object.entries(tablesWithColumns)) {
    out[table] = db.prepare(`SELECT ${columns.map((c) => `"${c}"`).join(', ')} FROM "${table}" ORDER BY rowid`).all();
  }
  return out;
}

function tableColumns(db) {
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
    .all()
    .map((r) => r.name);
  return Object.fromEntries(tables.map((t) => [t, db.pragma(`table_info("${t}")`).map((c) => c.name)]));
}

function indexNames(db) {
  return db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
    .all()
    .map((r) => r.name);
}

function sequences(db) {
  return Object.fromEntries(db.prepare(`SELECT name, seq FROM sqlite_sequence`).all().map((r) => [r.name, r.seq]));
}

function serviceView(db) {
  return {
    events: listEvents(db),
    eventsByType: Object.fromEntries(
      ['diaper', 'bottle', 'breastfeeding', 'contraction', 'outing', 'temperature', 'medication', 'sleep'].map((t) => [t, listEvents(db, { type: t })])
    ),
    child: getChild(db),
    growth: listGrowthMeasurements(db),
    milestones: getMilestoneCompletions(db),
    tokens: listApiTokens(db, 1).concat(listApiTokens(db, 2)),
  };
}

function snapshotBefore(slug) {
  const db = new Database(dbFile(slug), { readonly: true });
  try {
    const columns = tableColumns(db);
    return {
      columns,
      dump: dumpAll(db, columns),
      indexes: indexNames(db),
      sequences: sequences(db),
      version: db.pragma('user_version', { simple: true }),
      services: serviceView(db),
    };
  } finally {
    db.close();
  }
}

before(async () => {
  hashes = PASSWORDS.map((p) => hashPassword(p));
  validExpiry = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString();
  expiredExpiry = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();

  for (const s of SCENARIOS) {
    fs.mkdirSync(path.dirname(dbFile(s.slug)), { recursive: true });
    const db = new Database(dbFile(s.slug));
    db.pragma('foreign_keys = ON');
    db.exec(fixture(s.schema));
    populateProductionRows(db, { suffix: s.slug, hashes, validExpiry, expiredExpiry });
    s.extras?.(db);
    db.pragma(`user_version = ${s.version}`);
    db.close();
    before_[s.slug] = snapshotBefore(s.slug);
  }

  // What a brand-new install looks like with the current code (reference for the final schema).
  const fresh = new Database(':memory:');
  fresh.pragma('foreign_keys = ON');
  fresh.exec(currentSchemaSql);
  const realLog = console.log;
  console.log = () => {};
  try {
    runMigrations(fresh);
  } finally {
    console.log = realLog;
  }
  freshInfo = { version: fresh.pragma('user_version', { simple: true }), columns: tableColumns(fresh), indexes: indexNames(fresh) };
  freshInfo.tableInfo = Object.fromEntries(
    Object.keys(freshInfo.columns).map((t) => [t, normalisedTableInfo(fresh, t)])
  );
  fresh.close();

  // THE upgrade: the same call sequence index.js runs at boot.
  const realLog2 = console.log;
  const realError = console.error;
  const errors = [];
  console.log = (...args) => upgradeLogs.all.push(args.join(' '));
  console.error = (...args) => errors.push(args.join(' '));
  upgradeLogs.all = [];
  try {
    households.runMigrationsForAllHouseholds(runMigrations);
  } finally {
    console.log = realLog2;
    console.error = realError;
  }
  upgradeLogs.errors = errors;
});

after(() => {
  // The household handles stay open for the life of the process (as in the app); on Windows that
  // locks the files, so removal is best-effort - the directory lives in the OS temp folder.
  try {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

function normalisedTableInfo(db, table) {
  return db
    .pragma(`table_info("${table}")`)
    .map((c) => ({ name: c.name, type: c.type, notnull: c.notnull, dflt: c.dflt_value, pk: c.pk }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function openAfter(slug) {
  const entry = households.allHouseholdDbs().find((h) => h.slug === slug);
  assert.ok(entry, `household ${slug} must still be available after migrations`);
  return entry.db;
}

// ------------------------------------------------------------------ the tests

test('no household failed to open or migrate', () => {
  assert.deepEqual(upgradeLogs.errors, []);
  assert.deepEqual(
    households.allHouseholdDbs().map((h) => h.slug).sort(),
    SCENARIOS.map((s) => s.slug).sort()
  );
});

test('fixtures are production-shaped: v2 production db has no later columns or tables', () => {
  const cols = before_.prod.columns;
  assert.deepEqual(cols.settings, ['id', 'hide_contractions']);
  assert.ok(!cols.users.includes('language'));
  assert.ok(!('notification_prefs' in cols) && !('medication_reminders' in cols));
  assert.equal(before_.prod.version, 2);
  // every event type is present, medication rows have no `who`
  const types = new Set(before_.prod.dump.events.map((e) => e.type));
  assert.deepEqual([...types].sort(), ['bottle', 'breastfeeding', 'contraction', 'diaper', 'medication', 'outing', 'sleep', 'temperature']);
  const meds = before_.prod.dump.events.filter((e) => e.type === 'medication').map((e) => JSON.parse(e.details));
  assert.ok(meds.length >= 3 && meds.every((d) => !('who' in d)));
  assert.deepEqual(meds.map((d) => d.name), ['Paracetamol', 'Ibuprofen', 'Gaviscon Advance (custom)']);
});

for (const s of SCENARIOS) {
  test(`[${s.label}] reaches the latest user_version, same as a fresh install`, () => {
    const db = openAfter(s.slug);
    const v = db.pragma('user_version', { simple: true });
    assert.equal(v, freshInfo.version);
    assert.ok(v >= 6, 'at least the language migration');
    assert.ok(v >= ORIGINAL_USER_VERSION[s.slug]);
  });

  test(`[${s.label}] every original row of every original table is unchanged, in order`, () => {
    const db = openAfter(s.slug);
    const b = before_[s.slug];
    const after_ = dumpAll(db, b.columns);
    for (const table of Object.keys(b.columns)) {
      assert.ok(b.dump[table].length > 0 || ['notification_prefs', 'medication_reminders'].includes(table), `${table} had rows`);
      assert.deepEqual(after_[table], b.dump[table], `table ${table} changed`);
    }
    // autoincrement counters (next event / user / token ids) must not move either
    assert.deepEqual(sequences(db), b.sequences);
    // every original index survived
    for (const idx of b.indexes) assert.ok(indexNames(db).includes(idx), `index ${idx} lost`);
  });

  test(`[${s.label}] final schema is equivalent to a fresh install (same tables, columns, types, defaults)`, () => {
    const db = openAfter(s.slug);
    const cols = tableColumns(db);
    assert.deepEqual(Object.keys(cols).sort(), Object.keys(freshInfo.columns).sort());
    for (const table of Object.keys(freshInfo.columns)) {
      assert.deepEqual(normalisedTableInfo(db, table), freshInfo.tableInfo[table], `table ${table}`);
    }
    for (const idx of freshInfo.indexes) assert.ok(indexNames(db).includes(idx), `index ${idx} missing`);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
  });

  test(`[${s.label}] services return the same data as before the upgrade`, () => {
    const db = openAfter(s.slug);
    assert.deepEqual(serviceView(db), before_[s.slug].services);
    // event types (stored text) still readable and constraint-valid
    assert.equal(listEvents(db, { type: 'medication' }).length, 3);
    for (const e of listEvents(db, { type: 'medication' })) assert.ok(!('who' in e.details));
  });

  test(`[${s.label}] settings: old flags kept, new flags at defaults (or the dev build's own values)`, () => {
    const db = openAfter(s.slug);
    const row = db.prepare(`SELECT * FROM settings WHERE id = 1`).get();
    const defaults = { hide_contractions: 0, hide_baby_medication: 0, mom_user_id: null, feed_prompt: 1 };
    const original = before_[s.slug].dump.settings[0];
    assert.equal(original.hide_contractions, 1);
    assert.deepEqual(row, { id: 1, ...defaults, ...original });
    if (s.slug === 'prod') {
      assert.deepEqual(row, { id: 1, hide_contractions: 1, hide_baby_medication: 0, mom_user_id: null, feed_prompt: 1 });
      assert.deepEqual(getSettings(db), { hideContractions: true, hideBabyMedication: false, feedPrompt: true });
    }
    assert.equal(getSettings(db).hideContractions, true);
  });

  // Alice picked French for her reminders in the dev v4 build: that choice is carried over to her
  // account language; everyone else has not chosen one yet.
  const aliceLanguage = s.slug === 'dev4' ? 'fr' : null;

  test(`[${s.label}] users.language is NULL for existing users (unless a French reminder language was chosen), the check constraint is in place`, () => {
    const db = openAfter(s.slug);
    assert.deepEqual(db.prepare(`SELECT language FROM users ORDER BY id`).all(), [{ language: aliceLanguage }, { language: null }]);
    assert.equal(getUserLanguage(db, 1), aliceLanguage ?? 'en');
    assert.throws(() => db.prepare(`UPDATE users SET language = 'de' WHERE id = 1`).run(), /CHECK/i);
    db.prepare(`UPDATE users SET language = 'fr' WHERE id = 2`).run();
    assert.equal(getUserLanguage(db, 2), 'fr');
    db.prepare(`UPDATE users SET language = NULL WHERE id = 2`).run(); // leave the db as found
  });

  test(`[${s.label}] old password hashes verify; old sessions and api tokens resolve through the real queries`, () => {
    openAfter(s.slug);
    const found = households.findHouseholdByUsername(`alice-${s.slug}`);
    assert.equal(found.slug, s.slug);
    assert.ok(verifyPassword(PASSWORDS[0], found.result.password_hash));
    assert.ok(!verifyPassword('wrong', found.result.password_hash));
    assert.equal(found.result.password_hash, hashes[0]);
    const bob = households.findHouseholdByUsername(`bob-${s.slug}`);
    assert.ok(verifyPassword(PASSWORDS[1], bob.result.password_hash));

    const session = households.findHouseholdBySessionToken(`valid-alice-${s.slug}`);
    assert.equal(session.slug, s.slug);
    assert.deepEqual(session.result, { id: 1, username: `alice-${s.slug}`, displayName: 'Alice', language: aliceLanguage });
    assert.equal(households.findHouseholdBySessionToken(`valid-bob-${s.slug}`).result.displayName, 'Bob');
    assert.equal(households.findHouseholdBySessionToken(`expired-alice-${s.slug}`), null);
    assert.equal(households.findHouseholdBySessionToken('never-issued'), null);

    // api tokens: the stored hash is looked up the way requireAuth/mcp do
    const tok = households.findHouseholdByTokenHash(`hash-ha-${s.slug}`);
    assert.equal(tok.result.username, `alice-${s.slug}`);
    assert.equal(tok.result.language, aliceLanguage);
    assert.equal(households.findHouseholdByTokenHash(hashToken('bt_unknown')), null);
  });

  test(`[${s.label}] a second open (restart) is a no-op: schema, data and version identical, nothing logged`, () => {
    const first = openAfter(s.slug);
    const columns = tableColumns(first);
    const snapshot = { dump: dumpAll(first, columns), version: first.pragma('user_version', { simple: true }), columns };
    const snapshotSeq = sequences(first);

    // restart as openHouseholdDb does: a brand-new handle, schema.sql, then migrations
    const second = new Database(dbFile(s.slug));
    const logs = [];
    const realLog = console.log;
    console.log = (...a) => logs.push(a.join(' '));
    try {
      second.pragma('journal_mode = WAL');
      second.pragma('foreign_keys = ON');
      second.exec(currentSchemaSql);
      runMigrations(second);
      assert.deepEqual(logs, [], 'no migration should run again');
      assert.equal(second.pragma('user_version', { simple: true }), snapshot.version);
      assert.deepEqual(tableColumns(second), snapshot.columns);
      assert.deepEqual(dumpAll(second, columns), snapshot.dump);
      assert.deepEqual(sequences(second), snapshotSeq);
    } finally {
      console.log = realLog;
      second.close();
    }
    // and the household-level helper too
    households.runMigrationsForAllHouseholds(runMigrations);
    assert.deepEqual(dumpAll(first, columns), snapshot.dump);
  });
}

test('the production upgrade ran exactly the migrations it needed (v3 .. latest) and nothing else', () => {
  const logs = upgradeLogs.all;
  for (const msg of [
    'Added settings.hide_baby_medication',
    'Added settings.mom_user_id for email reminders',
    'Added settings.feed_prompt',
    'Added users.language',
  ]) {
    assert.ok(logs.includes(msg), `missing log: ${msg}`);
  }
  // events table is NOT rebuilt for a v2 database (no events copy/swap risk on production)
  assert.ok(!logs.some((l) => l.startsWith('Migrated events.type')));
});

// ------------------------------------------------------------------ behaviour on upgraded data

test('legacy medication rows (no `who`) are still Mum\'s: reminders go to Mum only', () => {
  const db = openAfter('prod');
  // Boot sequence: the add-on config names the mum account, then parents opt in to reminders.
  const momId = households.setHouseholdMom('prod', 'alice-prod');
  assert.equal(momId, 1);
  assert.equal(getMomUserId(db), 1);
  savePrefs(db, 1, { email: 'alice@example.test', enabled: true }, new Date('2026-09-01T00:00:00Z'));
  savePrefs(db, 2, { email: 'bob@example.test', enabled: true }, new Date('2026-09-01T00:00:00Z'));

  const dueMs = Date.parse(FIXTURE_DOSE.paracetamolStartedAt) + FIXTURE_DOSE.paracetamolIntervalHours * 3600000;
  const due = collectDueReminders(db, dueMs + 5 * 60000);
  assert.equal(due.length, 1);
  assert.equal(due[0].who, 'mom');
  assert.equal(due[0].eventId, 1);
  assert.deepEqual(due[0].recipients.map((r) => r.userId), [1], 'Bob must not be reminded about Mum\'s legacy dose');
  assert.equal(due[0].recipients[0].language, null, 'language NULL is passed through; the mailer falls back to English');

  // without a configured Mum, a legacy (Mum's) dose reminds nobody - it is never treated as the baby's
  db.prepare(`UPDATE settings SET mom_user_id = NULL WHERE id = 1`).run();
  assert.deepEqual(collectDueReminders(db, dueMs + 5 * 60000), []);
  households.setHouseholdMom('prod', 'alice-prod');
});

test('users without a language still log in; PATCH /language persists and is returned next time', async (t) => {
  openAfter('prod');
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRouter);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api/auth`;
  const call = async (method, url, body, cookie) => {
    const res = await fetch(base + url, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, setCookie: res.headers.get('set-cookie') };
  };

  // login with the PRE-UPGRADE password hash; language is null
  const bad = await call('POST', '/login', { username: 'alice-prod', password: 'nope' });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.code, 'AUTH_INVALID_CREDENTIALS');
  const login = await call('POST', '/login', { username: 'alice-prod', password: PASSWORDS[0] });
  assert.equal(login.status, 200);
  assert.deepEqual(login.body, { id: 1, username: 'alice-prod', displayName: 'Alice', language: null });
  const cookie = login.setCookie.split(';')[0];

  // an OLD (pre-upgrade) session still authenticates
  const old = await call('GET', '/session', null, 'bt_session=valid-alice-prod');
  assert.equal(old.status, 200);
  assert.equal(old.body.language, null);
  assert.equal((await call('GET', '/session', null, 'bt_session=expired-alice-prod')).status, 401);

  // invalid language is rejected and does not touch the row
  const rejected = await call('PATCH', '/language', { language: 'de' }, cookie);
  assert.equal(rejected.status, 400);
  assert.equal(rejected.body.code, 'LANGUAGE_INVALID');
  assert.equal(households.findHouseholdByUsername('alice-prod').result.language, null);

  const saved = await call('PATCH', '/language', { language: 'fr' }, cookie);
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body, { language: 'fr' });
  assert.equal(households.findHouseholdByUsername('alice-prod').result.language, 'fr');
  assert.equal((await call('GET', '/session', null, cookie)).body.language, 'fr');
  const again = await call('POST', '/login', { username: 'alice-prod', password: PASSWORDS[0] });
  assert.equal(again.body.language, 'fr');
  // Bob (never chose) is untouched
  assert.equal(households.findHouseholdByUsername('bob-prod').result.language, null);

  // changing the password still works with the old hash as the "current" password
  const changed = await call('PATCH', '/password', { currentPassword: PASSWORDS[0], newPassword: 'brand-new-pw' }, cookie);
  assert.equal(changed.status, 204);
  assert.equal((await call('POST', '/login', { username: 'alice-prod', password: 'brand-new-pw' })).status, 200);
});

test('new writes after the upgrade work and keep ids continuing from the old sequences', async () => {
  const db = openAfter('dev5');
  const { createEvent } = await import('./eventsService.js');
  const maxBefore = Math.max(...before_.dev5.dump.events.map((e) => e.id));
  const created = createEvent(db, {
    type: 'medication',
    startedAt: '2026-10-01T08:00:00.000Z',
    endedAt: '2026-10-01T08:00:00.000Z',
    details: { name: 'Paracetamol', who: 'baby', doseAmount: 1, doseUnit: 'ml', intervalHours: 4 },
    createdBy: 1,
  });
  assert.equal(created.id, maxBefore + 1);
  assert.equal(created.details.name, 'Paracetamol');
});
