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
import { freezerRouter } from './routes/freezer.js';
import {
  FreezerError,
  UNDO_WINDOW_MS,
  createBag,
  discardBag,
  expireOverdue,
  getFreezer,
  nextReference,
  planFor,
  thawBags,
  undoThaw,
  undoThawMany,
  updateBag,
} from './freezerService.js';
import { ALERT_DAYS, bagsToAnnounce, processFreezerHousehold } from './freezerAlerts.js';
import { runReminderTick } from './reminders.js';
import { freezerExpiryEmail } from './emailTemplates.js';
import { savePrefs } from './notificationsService.js';

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

// Fixed clock: 25 Oct 2026, 09:00 in London (GMT).
const NOW = new Date('2026-10-25T09:00:00Z');
const at = (iso) => new Date(iso);
// Inserts a bag directly, so a test can have one whose date is already past (the service refuses
// to create those: they would vanish from the list as soon as they were saved).
function rawBag(db, { quantityMl, frozenOn, expiresOn, reference }) {
  const ref = reference ?? nextReference(db);
  const id = db
    .prepare(`INSERT INTO freezer_bags (reference, quantity_ml, frozen_on, expires_on) VALUES (?, ?, ?, ?)`)
    .run(ref, quantityMl, frozenOn, expiresOn).lastInsertRowid;
  return { id, reference: ref };
}
const rejects = (fn, code) =>
  assert.throws(fn, (e) => e instanceof FreezerError && e.code === code, `expected ${code}`);

test('a new bag defaults to today, expires 4 months later and gets the next number', () => {
  const db = makeDb();
  const first = createBag(db, { quantityMl: 80 }, NOW);
  assert.equal(first.reference, 1);
  assert.equal(first.frozenOn, '2026-10-25');
  assert.equal(first.expiresOn, '2027-02-25');
  assert.equal(first.status, 'frozen');
  assert.equal(first.daysLeft, 123);
  assert.equal(createBag(db, { quantityMl: 60 }, NOW).reference, 2);
  assert.equal(nextReference(db), 3);
});

test('end-of-month freezing dates clamp the expiry (31 Oct -> 28 Feb)', () => {
  const db = makeDb();
  assert.equal(createBag(db, { quantityMl: 50, frozenOn: '2026-10-31' }, NOW).expiresOn, '2027-02-28');
});

test('numbers are never reused, even after the highest bag is used or thrown away', () => {
  const db = makeDb();
  createBag(db, { quantityMl: 50 }, NOW);
  const second = createBag(db, { quantityMl: 50 }, NOW);
  discardBag(db, second.id, NOW);
  assert.equal(nextReference(db), 3);
  assert.equal(createBag(db, { quantityMl: 50 }, NOW).reference, 3);
});

test('a number can be chosen, but two bags cannot share one', () => {
  const db = makeDb();
  createBag(db, { quantityMl: 50, reference: 8 }, NOW);
  rejects(() => createBag(db, { quantityMl: 50, reference: 8 }, NOW), 'FREEZER_REFERENCE_TAKEN');
  assert.equal(nextReference(db), 9);
});

test('a number is never given again, even once its bag has been used or thrown away', () => {
  const db = makeDb();
  const a = createBag(db, { quantityMl: 50 }, NOW);
  const b = createBag(db, { quantityMl: 50 }, NOW);
  thawBags(db, [a.id], NOW);
  discardBag(db, b.id, NOW);
  rejects(() => createBag(db, { quantityMl: 50, reference: a.reference }, NOW), 'FREEZER_REFERENCE_TAKEN');
  rejects(() => createBag(db, { quantityMl: 50, reference: b.reference }, NOW), 'FREEZER_REFERENCE_TAKEN');
  const c = createBag(db, { quantityMl: 50 }, NOW);
  rejects(() => updateBag(db, c.id, { reference: a.reference }, NOW), 'FREEZER_REFERENCE_TAKEN');
});

test('a mistyped number far above the highest one is refused, so numbering cannot be wrecked', () => {
  const db = makeDb();
  createBag(db, { quantityMl: 50 }, NOW);
  rejects(() => createBag(db, { quantityMl: 50, reference: 5000 }, NOW), 'FREEZER_REFERENCE_INVALID');
  const b = createBag(db, { quantityMl: 50 }, NOW);
  rejects(() => updateBag(db, b.id, { reference: 5000 }, NOW), 'FREEZER_REFERENCE_INVALID');
  assert.equal(createBag(db, { quantityMl: 50, reference: 12 }, NOW).reference, 12, 'a small jump is fine');
  assert.equal(nextReference(db), 13);
  // Keeping the same number while editing something else is not a clash with itself.
  assert.equal(updateBag(db, b.id, { reference: b.reference, quantityMl: 70 }, NOW).quantityMl, 70);
});

test('a bag cannot be created or edited with a date that has already passed', () => {
  const db = makeDb();
  rejects(() => createBag(db, { quantityMl: 50, frozenOn: '2026-05-01' }, NOW), 'FREEZER_EXPIRY_PAST');
  rejects(() => createBag(db, { quantityMl: 50, frozenOn: '2026-06-01', expiresOn: '2026-10-24' }, NOW), 'FREEZER_EXPIRY_PAST');
  const ok = createBag(db, { quantityMl: 50, expiresOn: '2026-10-25' }, NOW);
  assert.equal(ok.daysLeft, 0, 'today is still the last good day');
  rejects(() => updateBag(db, ok.id, { frozenOn: '2026-06-01', expiresOn: '2026-10-01' }, NOW), 'FREEZER_EXPIRY_PAST');
  rejects(() => updateBag(db, ok.id, { frozenOn: '2026-01-01' }, NOW), 'FREEZER_EXPIRY_PAST');
  assert.equal(getFreezer(db, NOW).bags[0].expiresOn, '2026-10-25', 'nothing changed');
});

test('invalid input is rejected with a stable code', () => {
  const db = makeDb();
  for (const bad of [0, -5, 501, 1.5, '50', null, undefined, NaN]) {
    rejects(() => createBag(db, { quantityMl: bad }, NOW), 'FREEZER_QUANTITY_INVALID');
  }
  rejects(() => createBag(db, { quantityMl: 50, frozenOn: '2026-02-30' }, NOW), 'FREEZER_DATE_INVALID');
  rejects(() => createBag(db, { quantityMl: 50, expiresOn: 'tomorrow' }, NOW), 'FREEZER_DATE_INVALID');
  rejects(() => createBag(db, { quantityMl: 50, frozenOn: '2026-10-25', expiresOn: '2026-10-01' }, NOW), 'FREEZER_DATE_INVALID');
  rejects(() => createBag(db, { quantityMl: 50, reference: 0 }, NOW), 'FREEZER_REFERENCE_INVALID');
  rejects(() => createBag(db, { quantityMl: 50, reference: 1.5 }, NOW), 'FREEZER_REFERENCE_INVALID');
  rejects(() => createBag(db, { quantityMl: 50, notes: 'x'.repeat(201) }, NOW), 'FREEZER_NOTES_INVALID');
  assert.equal(getFreezer(db, NOW).bags.length, 0, 'nothing was stored');
});

test('the freezer list is sorted by expiry and keeps used/expired bags apart', () => {
  const db = makeDb();
  const late = createBag(db, { quantityMl: 50, expiresOn: '2027-01-01' }, NOW);
  const soon = createBag(db, { quantityMl: 60, expiresOn: '2026-11-01' }, NOW);
  const used = createBag(db, { quantityMl: 70, expiresOn: '2026-12-01' }, NOW);
  thawBags(db, [used.id], NOW);
  const view = getFreezer(db, NOW);
  assert.deepEqual(view.bags.map((b) => b.id), [soon.id, late.id]);
  assert.deepEqual(view.closed.map((b) => b.id), [used.id]);
  assert.equal(view.today, '2026-10-25');
  assert.equal(view.nextReference, 4);
});

test('bags past their date move to expired on their own, and are never planned', () => {
  const db = makeDb();
  const old = rawBag(db, { quantityMl: 50, frozenOn: '2026-06-01', expiresOn: '2026-10-24' });
  const today = createBag(db, { quantityMl: 50, expiresOn: '2026-10-25' }, NOW);
  assert.equal(expireOverdue(db, '2026-10-25'), 1);
  const view = getFreezer(db, NOW);
  assert.deepEqual(view.bags.map((b) => b.id), [today.id], 'a bag expiring today is still usable');
  assert.equal(view.closed.find((b) => b.id === old.id).status, 'expired');
  assert.deepEqual(planFor(db, 50, NOW).options[0].bagIds, [today.id]);
});

test('editing: quantity, date, number and notes; the expiry follows the freezing date', () => {
  const db = makeDb();
  const bag = createBag(db, { quantityMl: 50 }, NOW);
  const edited = updateBag(db, bag.id, { quantityMl: 65, notes: 'matin' }, NOW);
  assert.equal(edited.quantityMl, 65);
  assert.equal(edited.notes, 'matin');
  assert.equal(edited.expiresOn, '2027-02-25');
  assert.equal(updateBag(db, bag.id, { frozenOn: '2026-10-20' }, NOW).expiresOn, '2027-02-20');
  assert.equal(updateBag(db, bag.id, { expiresOn: '2027-03-01' }, NOW).expiresOn, '2027-03-01');
  assert.equal(updateBag(db, bag.id, { notes: '' }, NOW).notes, null);
});

test('editing a number to one that is taken is a conflict, and changes nothing', () => {
  const db = makeDb();
  createBag(db, { quantityMl: 50 }, NOW);
  const b = createBag(db, { quantityMl: 60 }, NOW);
  rejects(() => updateBag(db, b.id, { reference: 1, quantityMl: 99 }, NOW), 'FREEZER_REFERENCE_TAKEN');
  const after = getFreezer(db, NOW).bags.find((x) => x.id === b.id);
  assert.equal(after.quantityMl, 60);
  assert.equal(after.reference, 2);
});

test('used or expired bags cannot be edited; unknown ids are not found', () => {
  const db = makeDb();
  const bag = createBag(db, { quantityMl: 50 }, NOW);
  thawBags(db, [bag.id], NOW);
  rejects(() => updateBag(db, bag.id, { quantityMl: 10 }, NOW), 'FREEZER_BAG_NOT_FROZEN');
  rejects(() => updateBag(db, 9999, { quantityMl: 10 }, NOW), 'FREEZER_BAG_NOT_FOUND');
  rejects(() => updateBag(db, 'abc', { quantityMl: 10 }, NOW), 'FREEZER_BAG_NOT_FOUND');
  rejects(() => discardBag(db, 9999, NOW), 'FREEZER_BAG_NOT_FOUND');
});

test('thawing marks every chosen bag as used with the time', () => {
  const db = makeDb();
  const a = createBag(db, { quantityMl: 30 }, NOW);
  const b = createBag(db, { quantityMl: 50 }, NOW);
  const c = createBag(db, { quantityMl: 70 }, NOW);
  const thawed = thawBags(db, [b.id, a.id], NOW);
  assert.deepEqual(thawed.map((x) => x.reference), [1, 2]);
  assert.ok(thawed.every((x) => x.status === 'used' && x.usedAt === NOW.toISOString()));
  assert.deepEqual(getFreezer(db, NOW).bags.map((x) => x.id), [c.id]);
});

test('thawing is all or nothing: one stale bag cancels the whole thaw (conflict)', () => {
  const db = makeDb();
  const a = createBag(db, { quantityMl: 30 }, NOW);
  const b = createBag(db, { quantityMl: 50 }, NOW);
  thawBags(db, [b.id], NOW); // a second parent got there first
  rejects(() => thawBags(db, [a.id, b.id], NOW), 'FREEZER_BAG_CONFLICT');
  assert.equal(getFreezer(db, NOW).bags.find((x) => x.id === a.id).status, 'frozen', 'a is untouched');
});

test('an expired or unknown bag cannot be thawed', () => {
  const db = makeDb();
  const old = rawBag(db, { quantityMl: 50, frozenOn: '2026-06-01', expiresOn: '2026-10-24' });
  rejects(() => thawBags(db, [old.id], NOW), 'FREEZER_BAG_CONFLICT');
  rejects(() => thawBags(db, [4242], NOW), 'FREEZER_BAG_CONFLICT');
});

test('thaw validates its list of ids', () => {
  const db = makeDb();
  const a = createBag(db, { quantityMl: 30 }, NOW);
  for (const bad of [undefined, null, [], 'x', [a.id, a.id], [0], [-1], [1.5], ['1'], new Array(51).fill(1).map((_, i) => i + 1)]) {
    rejects(() => thawBags(db, bad, NOW), 'FREEZER_BAG_IDS_INVALID');
  }
});

test('undo puts a just-thawed bag back, but only within the window', () => {
  const db = makeDb();
  const a = createBag(db, { quantityMl: 30 }, NOW);
  thawBags(db, [a.id], NOW);
  const back = undoThaw(db, a.id, new Date(NOW.getTime() + UNDO_WINDOW_MS - 1000));
  assert.equal(back.status, 'frozen');
  assert.equal(back.usedAt, null);

  thawBags(db, [a.id], NOW);
  rejects(() => undoThaw(db, a.id, new Date(NOW.getTime() + UNDO_WINDOW_MS + 1000)), 'FREEZER_UNDO_EXPIRED');
  assert.equal(getFreezer(db, NOW).closed[0].status, 'used');
});

test('undo of a bag that was never thawed is refused', () => {
  const db = makeDb();
  const a = createBag(db, { quantityMl: 30 }, NOW);
  rejects(() => undoThaw(db, a.id, NOW), 'FREEZER_BAG_NOT_USED');
});

test('undoing a thaw of several bags is all or nothing', () => {
  const db = makeDb();
  const a = createBag(db, { quantityMl: 30 }, NOW);
  const b = createBag(db, { quantityMl: 40 }, NOW);
  const c = createBag(db, { quantityMl: 50 }, NOW);
  thawBags(db, [a.id, b.id], NOW);
  // b is not part of a failed attempt that includes a bag that was never thawed (c).
  rejects(() => undoThawMany(db, [a.id, c.id], NOW), 'FREEZER_BAG_NOT_USED');
  assert.deepEqual(getFreezer(db, NOW).closed.map((x) => x.status), ['used', 'used'], 'a is still used: nothing half-done');
  const back = undoThawMany(db, [a.id, b.id], NOW);
  assert.deepEqual(back.map((x) => x.status), ['frozen', 'frozen']);
  // A second attempt on the same bags is refused cleanly (not a partial success).
  rejects(() => undoThawMany(db, [a.id, b.id], NOW), 'FREEZER_BAG_NOT_USED');
  for (const bad of [undefined, [], [a.id, a.id], [0], 'x']) {
    rejects(() => undoThawMany(db, bad, NOW), 'FREEZER_BAG_IDS_INVALID');
  }
});

test('a bag thawed on its last day cannot be undone once that day has passed', () => {
  const db = makeDb();
  const a = createBag(db, { quantityMl: 30, expiresOn: '2026-10-25' }, NOW);
  const lateEvening = at('2026-10-25T23:50:00Z');
  thawBags(db, [a.id], lateEvening);
  rejects(() => undoThaw(db, a.id, at('2026-10-26T00:10:00Z')), 'FREEZER_UNDO_EXPIRED');
  assert.equal(undoThaw(db, a.id, at('2026-10-25T23:55:00Z')).status, 'frozen', 'still the same day: fine');
});

test('a thrown-away bag is expired, and cannot be thrown away twice or thawed', () => {
  const db = makeDb();
  const a = createBag(db, { quantityMl: 30 }, NOW);
  assert.equal(discardBag(db, a.id, NOW).status, 'expired');
  rejects(() => discardBag(db, a.id, NOW), 'FREEZER_BAG_NOT_FROZEN');
  rejects(() => thawBags(db, [a.id], NOW), 'FREEZER_BAG_CONFLICT');
});

test('planFor reads only the freezer and validates the target', () => {
  const db = makeDb();
  createBag(db, { quantityMl: 50 }, NOW);
  createBag(db, { quantityMl: 60 }, NOW);
  const plan = planFor(db, 110, NOW);
  assert.equal(plan.options[0].totalMl, 110);
  assert.deepEqual(plan.options[0].bags.map((b) => b.reference).sort(), [1, 2]);
  assert.equal(getFreezer(db, NOW).bags.length, 2, 'planning does not change anything');
  for (const bad of [0, -1, 2.5, '110', null, undefined, 99999]) {
    rejects(() => planFor(db, bad, NOW), 'FREEZER_TARGET_INVALID');
  }
});

test('the example end to end: 50 + 30 expiring tomorrow, fresh 60, 110 ml wanted -> the plan names bags 1, 2 and 3', () => {
  const db = makeDb();
  createBag(db, { quantityMl: 50, frozenOn: '2026-06-26', expiresOn: '2026-10-26' }, NOW);
  createBag(db, { quantityMl: 30, frozenOn: '2026-06-26', expiresOn: '2026-10-26' }, NOW);
  createBag(db, { quantityMl: 60, expiresOn: '2027-02-25' }, NOW);
  const plan = planFor(db, 110, NOW);
  assert.deepEqual(plan.options[0].bags.map((b) => b.reference).sort(), [1, 2, 3]);
  thawBags(db, plan.options[0].bagIds, NOW);
  assert.equal(getFreezer(db, NOW).bags.length, 0);
});

// ---- HTTP -------------------------------------------------------------------------------------

async function serve(db, t) {
  freezerRouter.stack = freezerRouter.stack.filter((layer) => layer.handle !== requireAuth);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.db = db;
    req.householdSlug = 'test-house';
    req.user = { id: 1, username: 'mum', displayName: 'Mum' };
    next();
  });
  app.use('/api/freezer', freezerRouter);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api/freezer`;
  return async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
}

test('HTTP: create, list, plan, thaw, undo, with the right statuses and codes', async (t) => {
  const db = makeDb();
  const call = await serve(db, t);

  const created = await call('POST', '/', { quantityMl: 50 });
  assert.equal(created.status, 201);
  assert.equal(created.body.reference, 1);
  assert.equal(created.body.createdBy, 1);
  await call('POST', '/', { quantityMl: 60 });

  const list = await call('GET', '/');
  assert.equal(list.status, 200);
  assert.equal(list.body.bags.length, 2);
  assert.equal(list.body.nextReference, 3);

  const plan = await call('POST', '/plan', { targetMl: 110 });
  assert.equal(plan.status, 200);
  assert.equal(plan.body.options[0].totalMl, 110);

  const thaw = await call('POST', '/thaw', { bagIds: plan.body.options[0].bagIds });
  assert.equal(thaw.status, 200);
  assert.equal(thaw.body.bags.length, 2);

  const again = await call('POST', '/thaw', { bagIds: plan.body.options[0].bagIds });
  assert.deepEqual([again.status, again.body.code], [409, 'FREEZER_BAG_CONFLICT']);

  const undo = await call('POST', '/undo', { bagIds: plan.body.options[0].bagIds });
  assert.equal(undo.status, 200);
  assert.deepEqual(undo.body.bags.map((b) => b.status), ['frozen', 'frozen']);
  const again2 = await call('POST', '/undo', { bagIds: plan.body.options[0].bagIds });
  assert.deepEqual([again2.status, again2.body.code], [409, 'FREEZER_BAG_NOT_USED']);
  await call('POST', '/thaw', { bagIds: [created.body.id] });
  const single = await call('POST', `/${created.body.id}/undo`);
  assert.equal(single.status, 200);
  assert.equal(single.body.status, 'frozen');
});

test('HTTP: errors always carry { error, code }', async (t) => {
  const db = makeDb();
  const call = await serve(db, t);
  const cases = [
    ['POST', '/', { quantityMl: 0 }, 400, 'FREEZER_QUANTITY_INVALID'],
    ['POST', '/', {}, 400, 'FREEZER_QUANTITY_INVALID'],
    ['POST', '/', { quantityMl: 50, frozenOn: 'nope' }, 400, 'FREEZER_DATE_INVALID'],
    ['POST', '/plan', {}, 400, 'FREEZER_TARGET_INVALID'],
    ['POST', '/thaw', { bagIds: [] }, 400, 'FREEZER_BAG_IDS_INVALID'],
    ['PATCH', '/77', { quantityMl: 10 }, 404, 'FREEZER_BAG_NOT_FOUND'],
    ['POST', '/77/discard', undefined, 404, 'FREEZER_BAG_NOT_FOUND'],
    ['POST', '/77/undo', undefined, 404, 'FREEZER_BAG_NOT_FOUND'],
  ];
  for (const [method, url, body, status, code] of cases) {
    const r = await call(method, url, body);
    assert.equal(r.status, status, `${method} ${url}`);
    assert.equal(r.body.code, code, `${method} ${url}`);
    assert.equal(typeof r.body.error, 'string');
  }
  const bag = (await call('POST', '/', { quantityMl: 50 })).body;
  const dup = await call('POST', '/', { quantityMl: 50, reference: bag.reference });
  assert.deepEqual([dup.status, dup.body.code], [409, 'FREEZER_REFERENCE_TAKEN']);
  const edit = await call('PATCH', `/${bag.id}`, { quantityMl: 70 });
  assert.equal(edit.body.quantityMl, 70);
  const discard = await call('POST', `/${bag.id}/discard`);
  assert.equal(discard.body.status, 'expired');
});

// ---- expiry emails ----------------------------------------------------------------------------

function fakeMailer() {
  const sent = [];
  return { sent, config: { publicUrl: 'https://example.test' }, send: async (m) => sent.push(m) };
}
const quietLog = { log() {}, error() {} };

function enableReminders(db, userId, email, language = 'en') {
  savePrefs(db, userId, { enabled: true, email }, new Date('2026-01-01T00:00:00Z'));
  db.prepare(`UPDATE users SET language = ? WHERE id = ?`).run(language, userId);
}

test('bagsToAnnounce picks bags exactly 7 and 2 days out, soonest first', () => {
  const db = makeDb();
  assert.deepEqual(ALERT_DAYS, [7, 2]);
  for (const [ref, expiresOn] of [[1, '2026-11-01'], [2, '2026-10-27'], [3, '2026-10-26'], [4, '2026-10-28'], [5, '2026-11-02'], [6, '2026-10-25']]) {
    createBag(db, { quantityMl: 50, reference: ref, expiresOn }, NOW);
  }
  assert.deepEqual(bagsToAnnounce(db, '2026-10-25').map((b) => [b.reference, b.daysLeft]), [[2, 2], [1, 7]]);
});

test('bags that are used, thrown away or already expired are not announced', () => {
  const db = makeDb();
  const used = createBag(db, { quantityMl: 50, expiresOn: '2026-10-27' }, NOW);
  const thrown = createBag(db, { quantityMl: 50, expiresOn: '2026-10-27' }, NOW);
  thawBags(db, [used.id], NOW);
  discardBag(db, thrown.id, NOW);
  assert.deepEqual(bagsToAnnounce(db, '2026-10-25'), []);
});

test('one email per parent with reminders on, in their language, listing the bag numbers', async () => {
  const db = makeDb();
  enableReminders(db, 1, 'mum@example.test', 'fr');
  enableReminders(db, 2, 'dad@example.test', 'en');
  createBag(db, { quantityMl: 60, reference: 5, expiresOn: '2026-10-27' }, NOW);
  createBag(db, { quantityMl: 40, reference: 9, expiresOn: '2026-11-01' }, NOW);
  const mailer = fakeMailer();
  const result = await processFreezerHousehold({ slug: 'h', db, mailer, publicUrl: 'https://example.test', now: NOW, log: quietLog });
  assert.deepEqual([result.ran, result.bags, result.sent], [true, 2, 2]);
  assert.equal(mailer.sent.length, 2);
  const fr = mailer.sent.find((m) => m.to === 'mum@example.test');
  const en = mailer.sent.find((m) => m.to === 'dad@example.test');
  assert.match(fr.text, /Poche n°5 \(60 ml\)/);
  assert.match(fr.text, /Poche n°9 \(40 ml\)/);
  assert.match(fr.text, /27 octobre 2026/);
  assert.match(en.text, /Bag no\. 5 \(60 ml\)/);
  assert.match(en.text, /1 November 2026/);
  assert.match(en.subject, /2 milk bags about to expire/);
});

test('it runs once a day: a second tick the same day, or a restart, sends nothing more', async () => {
  const db = makeDb();
  enableReminders(db, 1, 'mum@example.test');
  createBag(db, { quantityMl: 60, expiresOn: '2026-10-27' }, NOW);
  const mailer = fakeMailer();
  const run = (now) => processFreezerHousehold({ slug: 'h', db, mailer, publicUrl: null, now, log: quietLog });
  assert.equal((await run(NOW)).ran, true);
  assert.deepEqual(await run(at('2026-10-25T15:00:00Z')), { ran: false, reason: 'already-ran' });
  assert.equal(mailer.sent.length, 1);
  // The next day it runs again (the bag is then 1 day out: not announced, so no email).
  const nextDay = await run(at('2026-10-26T09:00:00Z'));
  assert.deepEqual([nextDay.ran, nextDay.bags], [true, 0]);
  assert.equal(mailer.sent.length, 1);
});

test('nothing is sent before 7:00 London time, and it catches up later the same day', async () => {
  const db = makeDb();
  enableReminders(db, 1, 'mum@example.test');
  createBag(db, { quantityMl: 60, expiresOn: '2026-10-27' }, NOW);
  const mailer = fakeMailer();
  const run = (now) => processFreezerHousehold({ slug: 'h', db, mailer, publicUrl: null, now, log: quietLog });
  assert.deepEqual(await run(at('2026-10-25T06:59:00Z')), { ran: false, reason: 'too-early' });
  assert.equal(mailer.sent.length, 0);
  assert.equal((await run(at('2026-10-25T07:00:00Z'))).sent, 1);
});

test('summer time: 06:30 UTC is 07:30 in London, so it already runs', async () => {
  const db = makeDb();
  enableReminders(db, 1, 'mum@example.test');
  createBag(db, { quantityMl: 60, expiresOn: '2026-07-03' }, at('2026-06-26T10:00:00Z'));
  const mailer = fakeMailer();
  const r = await processFreezerHousehold({ slug: 'h', db, mailer, publicUrl: null, now: at('2026-07-01T06:30:00Z'), log: quietLog });
  assert.deepEqual([r.ran, r.sent], [true, 1]);
});

test('no bag to announce: nothing is sent, but the day is recorded', async () => {
  const db = makeDb();
  enableReminders(db, 1, 'mum@example.test');
  createBag(db, { quantityMl: 60, expiresOn: '2027-02-01' }, NOW);
  const mailer = fakeMailer();
  const r = await processFreezerHousehold({ slug: 'h', db, mailer, publicUrl: null, now: NOW, log: quietLog });
  assert.deepEqual([r.ran, r.bags, r.sent], [true, 0, 0]);
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM freezer_alert_runs`).get().n, 1);
});

test('parents without reminders (or with an empty address) get nothing', async () => {
  const db = makeDb();
  createBag(db, { quantityMl: 60, expiresOn: '2026-10-27' }, NOW);
  const mailer = fakeMailer();
  const r = await processFreezerHousehold({ slug: 'h', db, mailer, publicUrl: null, now: NOW, log: quietLog });
  assert.deepEqual([r.ran, r.bags, r.sent], [true, 1, 0]);
  assert.equal(mailer.sent.length, 0);
});

test('a failing mail server does not stop the other parent, nor loop: the day is still recorded', async () => {
  const db = makeDb();
  enableReminders(db, 1, 'mum@example.test');
  enableReminders(db, 2, 'dad@example.test');
  createBag(db, { quantityMl: 60, expiresOn: '2026-10-27' }, NOW);
  const sent = [];
  const mailer = {
    config: {},
    send: async (m) => {
      if (m.to === 'mum@example.test') throw Object.assign(new Error('boom to mum@example.test'), { code: 'ECONNECTION' });
      sent.push(m);
    },
  };
  const errors = [];
  const log = { log() {}, error: (m) => errors.push(m) };
  const r = await processFreezerHousehold({ slug: 'h', db, mailer, publicUrl: null, now: NOW, log });
  assert.deepEqual([r.sent, sent.length], [1, 1]);
  assert.equal(errors.length, 1);
  assert.ok(!errors[0].includes('@'), 'the address is never logged');
  assert.deepEqual(await processFreezerHousehold({ slug: 'h', db, mailer, publicUrl: null, now: NOW, log }), { ran: false, reason: 'already-ran' });
});

test('the check also tidies overdue bags, even before 7:00', async () => {
  const db = makeDb();
  rawBag(db, { quantityMl: 60, frozenOn: '2026-06-01', expiresOn: '2026-10-24' });
  await processFreezerHousehold({ slug: 'h', db, mailer: fakeMailer(), publicUrl: null, now: at('2026-10-25T03:00:00Z'), log: quietLog });
  assert.equal(db.prepare(`SELECT status FROM freezer_bags`).get().status, 'expired');
});

test('the reminder tick runs the freezer check for each household, isolated from failures', async () => {
  const good = makeDb();
  enableReminders(good, 1, 'mum@example.test');
  createBag(good, { quantityMl: 60, expiresOn: '2026-10-27' }, NOW);
  const broken = new Database(':memory:'); // no tables at all
  const mailer = fakeMailer();
  const errors = [];
  await runReminderTick({
    getHouseholds: () => [{ slug: 'broken', db: broken }, { slug: 'good', db: good }],
    mailer,
    publicUrl: null,
    retries: new Map(),
    nowMs: NOW.getTime(),
    log: { log() {}, error: (m) => errors.push(m) },
  });
  assert.equal(mailer.sent.filter((m) => /milk bag/.test(m.subject)).length, 1);
  assert.ok(errors.some((m) => m.includes('broken')));
});

test('email wording: singular/plural, language fallback, total volume', () => {
  const one = freezerExpiryEmail({ bags: [{ reference: 3, quantityMl: 40, expiresOn: '2026-10-26', daysLeft: 1 }], language: 'en', publicUrl: 'https://x.test' });
  assert.match(one.subject, /^Baby Tracker: 1 milk bag about to expire$/);
  assert.match(one.text, /1 day left/);
  assert.match(one.text, /40 ml in total/);
  assert.match(one.text, /Open Baby Tracker: https:\/\/x\.test/);
  const fr = freezerExpiryEmail({ bags: [{ reference: 3, quantityMl: 40, expiresOn: '2026-10-26', daysLeft: 1 }], language: 'fr', publicUrl: null });
  assert.match(fr.subject, /1 poche de lait bientôt périmée/);
  assert.doesNotMatch(fr.text, /Ouvrir/);
  const unknown = freezerExpiryEmail({ bags: [{ reference: 1, quantityMl: 10, expiresOn: '2026-10-26', daysLeft: 2 }], language: 'de', publicUrl: null });
  assert.match(unknown.subject, /milk bag/);
});

test('the freezer tables exist on a fresh database', () => {
  const db = makeDb();
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((r) => r.name);
  assert.ok(tables.includes('freezer_bags') && tables.includes('freezer_alert_runs'));
});
