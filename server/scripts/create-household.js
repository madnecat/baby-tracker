#!/usr/bin/env node
/**
 * Provisions a new, fully independent household with its own SQLite file.
 *
 * Usage:
 *   node scripts/create-household.js <slug> <username:password:displayName> [<username:password:displayName> ...]
 *
 * Example:
 *   node scripts/create-household.js household-2 dupont:s3cret:Dupont marie:s3cret2:Marie
 *
 * Run this with the same DB_PATH/DATA_DIR the server itself uses, so the new
 * household lands in the same data directory (see server/src/households.js).
 */
import { hashPassword } from '../src/auth.js';
import { findHouseholdByUsername, getHouseholdDb, listHouseholdSlugs } from '../src/households.js';

const [slug, ...parentArgs] = process.argv.slice(2);

if (!slug || parentArgs.length === 0) {
  console.error(
    'Usage: node scripts/create-household.js <slug> <username:password:displayName> [...]'
  );
  process.exit(1);
}

if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error('slug must contain only lowercase letters, digits, and dashes.');
  process.exit(1);
}

if (listHouseholdSlugs().includes(slug)) {
  console.error(`Household "${slug}" already exists.`);
  process.exit(1);
}

// Note: username and password may not contain ':' (the field separator);
// displayName can, since it's everything after the second ':'.
const parents = parentArgs.map((arg) => {
  const [username, password, ...rest] = arg.split(':');
  if (!username || !password) {
    console.error(`Invalid parent spec "${arg}", expected username:password:displayName`);
    process.exit(1);
  }
  return { username, password, displayName: rest.join(':') || username };
});

// Login has no household selector — it looks a username up across every
// household database, so usernames must stay unique across all of them.
for (const p of parents) {
  const existing = findHouseholdByUsername(p.username);
  if (existing) {
    console.error(`Username "${p.username}" is already used in household "${existing.slug}".`);
    process.exit(1);
  }
}

const db = getHouseholdDb(slug);
const insert = db.prepare(
  `INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)`
);
for (const p of parents) {
  insert.run(p.username, p.displayName, hashPassword(p.password));
  console.log(`Created "${p.username}" in household "${slug}"`);
}
