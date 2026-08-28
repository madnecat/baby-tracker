import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

function householdDbPath(slug) {
  return path.join(HOUSEHOLDS_DIR, slug, 'data.db');
}

function openHouseholdDb(slug) {
  const dbPath = householdDbPath(slug);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(schemaSql);
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

function allHouseholdDbs() {
  return listHouseholdSlugs().map((slug) => ({ slug, db: getHouseholdDb(slug) }));
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
  for (const { db } of allHouseholdDbs()) {
    db.prepare(`DELETE FROM sessions WHERE expires_at < datetime('now')`).run();
  }
}

export function runMigrationsForAllHouseholds(runMigrations) {
  for (const { db } of allHouseholdDbs()) runMigrations(db);
}
