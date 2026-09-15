import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');

// Every household is a fully self-contained SQLite file with the exact same
// schema (users, sessions, api_tokens, child, events, growth_measurements,
// milestone_completions). There is no shared "core" database and no
// household_id column anywhere — two households can never be joined in a
// single query because there is no query that can see both files at once.
const LEGACY_DB_PATH =
  process.env.DB_PATH || path.join(__dirname, '..', 'data-dev', 'baby-tracker.db');
const DATA_DIR = process.env.DATA_DIR || path.dirname(LEGACY_DB_PATH);
const HOUSEHOLDS_DIR = path.join(DATA_DIR, 'households');

const openDbs = new Map(); // slug -> Database

const SLUG_PATTERN = /^[a-z0-9-]+$/;
// Present only in households created from the add-on's `households` list
// option; see syncConfigListHousehold().
const CONFIG_LIST_MARKER = 'config-list-household.json';

function householdDbPath(slug) {
  return path.join(HOUSEHOLDS_DIR, slug, 'data.db');
}

function openHouseholdDb(slug) {
  const dbPath = householdDbPath(slug);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(schemaSql);
  } catch (e) {
    db.close();
    throw e;
  }
  return db;
}

export function getHouseholdDb(slug) {
  if (!slug) throw new Error('getHouseholdDb requires a household slug');
  if (!openDbs.has(slug)) {
    openDbs.set(slug, openHouseholdDb(slug));
  }
  return openDbs.get(slug);
}

export function listHouseholdSlugs() {
  if (!fs.existsSync(HOUSEHOLDS_DIR)) return [];
  return fs
    .readdirSync(HOUSEHOLDS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/**
 * Moves a pre-multi-household single-file database into its own household
 * folder, byte-for-byte. This app's original database was always shaped
 * exactly like one household, so this is a file move, not a data migration —
 * no rows are read, transformed, or re-inserted.
 *
 * Safe to interrupt at any point (container restart, crash, etc.) and rerun:
 * files are staged in a directory *outside* HOUSEHOLDS_DIR first, so the
 * guard against re-running can't see it as "done" until every file has
 * actually been moved. The final step, renaming that staging directory into
 * place, is a single atomic filesystem operation (same-filesystem directory
 * rename), so there's no window where the migration could be half-visible as
 * complete. The guard checks specifically for household-1's own target
 * directory — not "any household exists" — so this still runs correctly even
 * if some other household was provisioned first.
 *
 * Before touching anything, it also *copies* (never moves) the untouched
 * original next to itself as `<name>.backup-pre-multihousehold` — a
 * zero-trust safety net that exists on disk regardless of whether anything
 * else in this function, or in the rest of the app, turns out to be wrong.
 */
export function migrateLegacySingleHouseholdDb() {
  const targetDir = path.join(HOUSEHOLDS_DIR, 'household-1');
  if (fs.existsSync(targetDir)) return; // already completed

  const stagingDir = path.join(DATA_DIR, '.household-1.migrating');

  if (!fs.existsSync(stagingDir)) {
    if (!fs.existsSync(LEGACY_DB_PATH)) return; // fresh install, nothing to migrate

    for (const suffix of ['', '-wal', '-shm']) {
      const from = `${LEGACY_DB_PATH}${suffix}`;
      if (fs.existsSync(from)) {
        fs.copyFileSync(from, `${from}.backup-pre-multihousehold`);
      }
    }

    fs.mkdirSync(stagingDir, { recursive: true });
  }

  for (const suffix of ['', '-wal', '-shm']) {
    const from = `${LEGACY_DB_PATH}${suffix}`;
    const to = path.join(stagingDir, `data.db${suffix}`);
    if (fs.existsSync(from) && !fs.existsSync(to)) {
      fs.renameSync(from, to);
    }
  }

  fs.mkdirSync(HOUSEHOLDS_DIR, { recursive: true });
  fs.renameSync(stagingDir, targetDir);
  console.log(`Migrated legacy single-household database into ${targetDir}`);
}

/**
 * Creates a new household with the given parent accounts. Shared by
 * scripts/create-household.js and the config-driven boot-time provisioning
 * in bootstrap.js, so both enforce the same rules: a valid slug, not already
 * taken, and usernames that don't collide with each other or with any
 * existing household (login has no household selector, so usernames must
 * stay unique across all of them). Throws on any violation; creates nothing
 * until all checks pass.
 */
export function provisionHousehold(slug, parents) {
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error('slug must contain only lowercase letters, digits, and dashes.');
  }
  if (listHouseholdSlugs().includes(slug)) {
    throw new Error(`Household "${slug}" already exists.`);
  }
  assertEveryHouseholdReadable();

  const usernamesInThisBatch = new Set();
  for (const p of parents) {
    if (usernamesInThisBatch.has(p.username)) {
      throw new Error(`Username "${p.username}" is given more than once.`);
    }
    usernamesInThisBatch.add(p.username);

    const existing = findHouseholdByUsername(p.username);
    if (existing) {
      throw new Error(`Username "${p.username}" is already used in household "${existing.slug}".`);
    }
  }

  const db = getHouseholdDb(slug);
  const insert = db.prepare(
    `INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)`
  );
  for (const p of parents) {
    insert.run(p.username, p.displayName, hashPassword(p.password));
  }
}

/**
 * Fixes up an already-provisioned household's usernames to match its current
 * Configuration options — needed because provisionHousehold() only ever runs
 * once per household (guarded by "does this slug already exist"), so fixing
 * a typo in the add-on's `household2_parent{1,2}_username` field and
 * restarting otherwise has no effect on the already-seeded account.
 *
 * There's no `household_id`/slot column identifying "this row is parent1",
 * so existing users are matched to configured parents by creation order
 * (oldest account = parent1, next = parent2, ...) — the same order
 * provisionHousehold() always inserts them in. Only touches `username`:
 * never display_name or password_hash, so it can't silently undo a password
 * a parent changed themselves via Settings (PATCH /auth/password).
 */
export function reconcileHouseholdUsernames(slug, parents) {
  assertEveryHouseholdReadable();
  const db = getHouseholdDb(slug);
  const existing = db.prepare(`SELECT id, username FROM users ORDER BY id ASC`).all();

  parents.forEach((p, i) => {
    const row = existing[i];
    if (!row || row.username === p.username) return;

    const collision = findHouseholdByUsername(p.username);
    if (collision) {
      console.error(
        `Could not rename "${row.username}" to "${p.username}" in household "${slug}": username already used in household "${collision.slug}".`
      );
      return;
    }

    db.prepare(`UPDATE users SET username = ? WHERE id = ?`).run(p.username, row.id);
    console.log(`Renamed account in household "${slug}": "${row.username}" -> "${p.username}"`);
  });
}

/**
 * Creates or updates a household declared in the add-on's `households` list
 * option. Deliberately separate from provisionHousehold() /
 * reconcileHouseholdUsernames() (which household-1 and household2 keep using
 * unchanged), because a list entry is much easier to edit, reorder, or
 * mistype than a fixed set of fields — so this path is built to never touch a
 * household it didn't create itself:
 *
 * - Ownership: at creation it writes a CONFIG_LIST_MARKER file inside the
 *   household's folder. An existing household without that marker
 *   (household-1, household2, anything made by create-household.js) is
 *   refused outright, so a list entry reusing its slug can never rename its
 *   users.
 * - Identity: the marker records which user id belongs to which parent slot
 *   ("1", "2"), so matching is by slot, not by creation order — removing
 *   parent1 from the entry or filling parent2 in later can't hand one
 *   parent's account (and events) to the other.
 *
 * `slots` is `[parent1, parent2]`, each `{ username, password, displayName }`
 * or null. Only usernames are ever reconciled, never passwords or display
 * names (parents can change their password themselves in Settings). A slot
 * with no account yet gets one created — additive only. Nothing is ever
 * deleted: removing an entry from the list leaves the household's data and
 * logins untouched (see markConfigListHouseholdRemoved).
 */
export function syncConfigListHousehold(slug, slots) {
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error('slug must contain only lowercase letters, digits, and dashes.');
  }

  const filled = slots.filter(Boolean);
  if (new Set(filled.map((p) => p.username)).size !== filled.length) {
    throw new Error('the same username is given for both parents.');
  }

  assertEveryHouseholdReadable();

  let marker;
  if (listHouseholdSlugs().includes(slug)) {
    marker = readConfigListMarker(slug);
    if (!marker) {
      throw new Error(
        `a household "${slug}" already exists and was not created from the "households" list — refusing to modify it.`
      );
    }
    if (marker.removedFromList) reattachConfigListHousehold(slug, marker, slots);
  } else {
    // Check every username before creating anything, so a collision never
    // leaves an empty household folder behind.
    for (const p of filled) {
      const existing = findHouseholdByUsername(p.username);
      if (existing) {
        throw new Error(`username "${p.username}" is already used in household "${existing.slug}".`);
      }
    }
    marker = { slots: {} };
    createConfigListHouseholdDir(slug, marker);
  }

  const db = getHouseholdDb(slug);

  slots.forEach((p, i) => {
    if (!p) return;
    const slot = String(i + 1);
    const userId = marker.slots[slot];

    if (userId != null) {
      const row = db.prepare(`SELECT id, username FROM users WHERE id = ?`).get(userId);
      if (!row) {
        console.error(`Household "${slug}": account for parent${slot} (id ${userId}) no longer exists — skipping.`);
        return;
      }
      if (row.username === p.username) return;

      const collision = findHouseholdByUsername(p.username);
      if (collision) {
        console.error(
          `Could not rename "${row.username}" to "${p.username}" in household "${slug}": username already used in household "${collision.slug}".`
        );
        return;
      }
      db.prepare(`UPDATE users SET username = ? WHERE id = ?`).run(p.username, row.id);
      console.log(`Renamed account in household "${slug}": "${row.username}" -> "${p.username}"`);
      return;
    }

    // No account recorded for this slot yet. If a previous boot inserted the
    // user but stopped before recording it in the marker, adopt that account
    // instead of failing on the username collision.
    const mappedIds = new Set(Object.values(marker.slots));
    const own = db.prepare(`SELECT id FROM users WHERE username = ?`).get(p.username);
    if (own && !mappedIds.has(own.id)) {
      marker.slots[slot] = own.id;
      writeConfigListMarker(slug, marker);
      return;
    }

    const collision = findHouseholdByUsername(p.username);
    if (collision) {
      console.error(
        `Could not create "${p.username}" in household "${slug}": username already used in household "${collision.slug}".`
      );
      return;
    }

    const { lastInsertRowid } = db
      .prepare(`INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)`)
      .run(p.username, p.displayName, hashPassword(p.password));
    marker.slots[slot] = Number(lastInsertRowid);
    writeConfigListMarker(slug, marker);
    console.log(`Seeded account: ${p.username} (${slug})`);
  });
}

/**
 * Records that a list-created household is no longer in the `households`
 * list. Nothing about the household itself changes (its parents can still
 * log in), but its slug can then only be re-added with the same usernames it
 * had — so reusing a removed family's slug for a *different* family can never
 * rename the first family's accounts and hand over their data.
 */
export function markConfigListHouseholdRemoved(slug) {
  const marker = readConfigListMarker(slug);
  if (!marker || marker.removedFromList) return;
  writeConfigListMarker(slug, { ...marker, removedFromList: true });
  console.warn(
    `Household "${slug}" was created from the "households" list but is no longer in it — its accounts and data are kept and can still log in. Re-adding it later requires its previous usernames.`
  );
}

function reattachConfigListHousehold(slug, marker, slots) {
  const db = getHouseholdDb(slug);
  const usernameOf = (id) => db.prepare(`SELECT username FROM users WHERE id = ?`).get(id)?.username;
  const comparable = slots
    .map((p, i) => ({ p, userId: marker.slots[String(i + 1)] }))
    .filter(({ p, userId }) => p && userId != null);
  const sameFamily = comparable.length > 0 && comparable.every(({ p, userId }) => usernameOf(userId) === p.username);
  if (!sameFamily) {
    const previous = Object.values(marker.slots).map(usernameOf).filter(Boolean);
    throw new Error(
      `household "${slug}" was removed from the list earlier and can only be re-added with its previous usernames (${previous.join(', ')}). To onboard a different family, use a new slug.`
    );
  }
  delete marker.removedFromList;
  writeConfigListMarker(slug, marker);
  console.log(`Household "${slug}" is back in the "households" list.`);
}

/** Slugs of households that were created from the `households` list option. */
export function listConfigListHouseholdSlugs() {
  return listHouseholdSlugs().filter((slug) => fs.existsSync(configListMarkerPath(slug)));
}

// The folder and its marker are assembled outside HOUSEHOLDS_DIR and moved
// into place with a single directory rename, so a crash can never leave a
// household folder without its marker (which would lock the slug out for
// good, since marker-less households are refused).
function createConfigListHouseholdDir(slug, marker) {
  const stagingDir = path.join(DATA_DIR, `.creating-household-${slug}`);
  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });
  fs.writeFileSync(path.join(stagingDir, CONFIG_LIST_MARKER), JSON.stringify(marker, null, 2));
  fs.mkdirSync(HOUSEHOLDS_DIR, { recursive: true });
  fs.renameSync(stagingDir, path.join(HOUSEHOLDS_DIR, slug));
}

function configListMarkerPath(slug) {
  return path.join(HOUSEHOLDS_DIR, slug, CONFIG_LIST_MARKER);
}

function readConfigListMarker(slug) {
  const markerPath = configListMarkerPath(slug);
  if (!fs.existsSync(markerPath)) return null;
  const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  return { slots: {}, ...marker };
}

// Write-then-rename so a crash mid-write can never leave a truncated marker.
function writeConfigListMarker(slug, marker) {
  const markerPath = configListMarkerPath(slug);
  fs.writeFileSync(`${markerPath}.tmp`, JSON.stringify(marker, null, 2));
  fs.renameSync(`${markerPath}.tmp`, markerPath);
}

// Households that failed to open or migrate at boot; left out until the
// add-on restarts, so they're never served on an unmigrated schema.
const unavailableHouseholds = new Set();
const householdsOpenFailureLogged = new Set();

/**
 * Every household that can currently be opened. A household whose database
 * fails to open is skipped (logged) rather than throwing, so one unreadable
 * file doesn't stop other households from logging in or using their
 * sessions and API tokens.
 */
function allHouseholdDbs() {
  const result = [];
  for (const slug of listHouseholdSlugs()) {
    if (unavailableHouseholds.has(slug)) continue;
    try {
      result.push({ slug, db: getHouseholdDb(slug) });
      householdsOpenFailureLogged.delete(slug);
    } catch (e) {
      if (!householdsOpenFailureLogged.has(slug)) {
        householdsOpenFailureLogged.add(slug);
        console.error(`Could not open household "${slug}", skipping it: ${e.message}`);
      }
    }
  }
  return result;
}

/**
 * Usernames must be unique across households, but lookups skip a household
 * that can't be opened — so before creating or renaming any account, make
 * sure every household is actually readable, otherwise a duplicate of an
 * unreadable household's username could slip through.
 */
function assertEveryHouseholdReadable() {
  const unreadable = listHouseholdSlugs().filter((slug) => {
    if (unavailableHouseholds.has(slug)) return true;
    try {
      getHouseholdDb(slug);
      return false;
    } catch {
      return true;
    }
  });
  if (unreadable.length > 0) {
    throw new Error(
      `household(s) ${unreadable.join(', ')} can't be read, so usernames can't be checked for duplicates — not creating or renaming any account.`
    );
  }
}

/**
 * Runs `query(db)` against each household in turn and returns the first hit
 * as { slug, db, result }, or null. This is the only place in the codebase
 * that looks across more than one household — every result it returns is
 * still scoped to exactly one household's connection.
 */
function findAcrossHouseholds(query) {
  for (const { slug, db } of allHouseholdDbs()) {
    const result = query(db);
    if (result) return { slug, db, result };
  }
  return null;
}

export function findHouseholdBySessionToken(token) {
  return findAcrossHouseholds((db) =>
    db
      .prepare(
        `SELECT users.id, users.username, users.display_name AS displayName
         FROM sessions JOIN users ON users.id = sessions.user_id
         WHERE sessions.token = ? AND sessions.expires_at > datetime('now')`
      )
      .get(token)
  );
}

export function findHouseholdByUsername(username) {
  return findAcrossHouseholds((db) => db.prepare(`SELECT * FROM users WHERE username = ?`).get(username));
}

export function findHouseholdByTokenHash(tokenHash) {
  return findAcrossHouseholds((db) =>
    db
      .prepare(
        `SELECT users.id, users.username, users.display_name AS displayName, api_tokens.id AS tokenId
         FROM api_tokens JOIN users ON users.id = api_tokens.user_id
         WHERE api_tokens.token_hash = ?`
      )
      .get(tokenHash)
  );
}

export function purgeExpiredSessionsEverywhere() {
  for (const { slug, db } of allHouseholdDbs()) {
    try {
      db.prepare(`DELETE FROM sessions WHERE expires_at < datetime('now')`).run();
    } catch (e) {
      console.error(`Could not purge expired sessions for household "${slug}": ${e.message}`);
    }
  }
}

export function runMigrationsForAllHouseholds(runMigrations) {
  for (const slug of listHouseholdSlugs()) {
    try {
      runMigrations(getHouseholdDb(slug));
    } catch (e) {
      unavailableHouseholds.add(slug);
      console.error(
        `Household "${slug}" could not be opened or migrated and is unavailable until the add-on restarts: ${e.message}`
      );
    }
  }
}
