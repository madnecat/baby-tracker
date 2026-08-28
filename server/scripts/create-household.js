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
import { provisionHousehold } from '../src/households.js';

const [slug, ...parentArgs] = process.argv.slice(2);

if (!slug || parentArgs.length === 0) {
  console.error(
    'Usage: node scripts/create-household.js <slug> <username:password:displayName> [...]'
  );
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

try {
  provisionHousehold(slug, parents);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

for (const p of parents) {
  console.log(`Created "${p.username}" in household "${slug}"`);
}
