#!/usr/bin/env node
/**
 * Loads one named sleep scenario so the prediction card and the Charts sleep section can be looked
 * at by hand. Development tool only — it is never run by the add-on.
 *
 * It writes into its own household ("sleep-fixtures"), a separate SQLite file from every real
 * household, so it cannot touch anyone's actual data whatever DATA_DIR points at. Log in as the
 * fixture parent to see it, log back in as yourself to leave it behind.
 *
 * The scenarios themselves live in web/src/lib/sleepScenarios.js, next to the tests that assert
 * they really produce what they claim — so what this prints is what the engine is checked to do.
 *
 * Usage:
 *   node scripts/seed-sleep-scenario.js list
 *   node scripts/seed-sleep-scenario.js <scenario>
 *
 * Run it with the same DATA_DIR/DB_PATH as the server, then log in as fixture / fixturepass123.
 */
import { getHouseholdDb, listHouseholdSlugs, provisionHousehold } from '../src/households.js';
import { runMigrations } from '../src/migrations.js';
import { SLEEP_SCENARIOS, scenarioChild } from '../../web/src/lib/sleepScenarios.js';

const SLUG = 'sleep-fixtures';
const USERNAME = 'fixture';
const PASSWORD = 'fixturepass123';

const [name] = process.argv.slice(2);

if (!name || name === 'list' || !SLEEP_SCENARIOS[name]) {
  if (name && name !== 'list') console.error(`Unknown scenario "${name}".\n`);
  console.log('Usage: node scripts/seed-sleep-scenario.js <scenario>\n');
  for (const [key, s] of Object.entries(SLEEP_SCENARIOS)) {
    console.log(`  ${key.padEnd(18)} ${s.summary}`);
  }
  process.exit(name && name !== 'list' ? 1 : 0);
}

const scenario = SLEEP_SCENARIOS[name];
const now = Date.now();
const child = scenarioChild(name, now);

if (!listHouseholdSlugs().includes(SLUG)) {
  provisionHousehold(SLUG, [
    { username: USERNAME, password: PASSWORD, displayName: 'Fixture parent' },
  ]);
  console.log(`Created household "${SLUG}" with login ${USERNAME} / ${PASSWORD}`);
}

const db = getHouseholdDb(SLUG);
runMigrations(db);

const dob = child.dateOfBirth.slice(0, 10);
db.prepare(
  `INSERT INTO child (id, name, date_of_birth, sex) VALUES (1, ?, ?, 'female')
   ON CONFLICT(id) DO UPDATE SET name = excluded.name, date_of_birth = excluded.date_of_birth`
).run(child.name, dob);

const events = scenario.build(now);
db.prepare('DELETE FROM events').run();
const insert = db.prepare(
  `INSERT INTO events (type, started_at, ended_at, details, created_by) VALUES (?, ?, ?, ?, 1)`
);
db.transaction((rows) => {
  for (const e of rows) {
    insert.run(e.type, e.startedAt, e.endedAt ?? null, JSON.stringify(e.details ?? {}));
  }
})(events);

const sleeps = events.filter((e) => e.type === 'sleep').length;
console.log(`\nSeeded "${name}": ${events.length} events (${sleeps} sleeps) into household ${SLUG}.`);
console.log(`Child is ${scenario.ageWeeks} weeks old (born ${dob}).`);
console.log(`\n${scenario.summary}\n`);
console.log('What you should see:');
for (const line of scenario.describe) console.log(`  - ${line}`);
console.log(`\nLog in as ${USERNAME} / ${PASSWORD}, and reload the page after seeding.`);
