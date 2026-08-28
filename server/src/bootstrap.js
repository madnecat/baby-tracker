import fs from 'node:fs';
import { hashPassword } from './auth.js';
import { getHouseholdDb, listHouseholdSlugs } from './households.js';

function loadOptions() {
  const optionsPath = process.env.OPTIONS_PATH || '/data/options.json';
  if (fs.existsSync(optionsPath)) {
    try {
      return JSON.parse(fs.readFileSync(optionsPath, 'utf8'));
    } catch {
      // fall through to env vars
    }
  }
  return {
    parent1_username: process.env.PARENT1_USERNAME,
    parent1_password: process.env.PARENT1_PASSWORD,
    parent1_display_name: process.env.PARENT1_DISPLAY_NAME,
    parent2_username: process.env.PARENT2_USERNAME,
    parent2_password: process.env.PARENT2_PASSWORD,
    parent2_display_name: process.env.PARENT2_DISPLAY_NAME,
  };
}

/**
 * Seeds the very first household ("household-1") from the add-on's
 * Configuration options, but only on a genuinely fresh install — if any
 * household already exists (including one just moved into place by
 * migrateLegacySingleHouseholdDb), this does nothing.
 */
export function bootstrapFirstHousehold() {
  if (listHouseholdSlugs().length > 0) return;

  const options = loadOptions();
  const parents = [
    {
      username: options.parent1_username,
      password: options.parent1_password,
      displayName: options.parent1_display_name || options.parent1_username,
    },
    {
      username: options.parent2_username,
      password: options.parent2_password,
      displayName: options.parent2_display_name || options.parent2_username,
    },
  ].filter((p) => p.username && p.password);

  if (parents.length === 0) {
    console.warn(
      'No parent accounts configured (set parent1_username/parent1_password in add-on Configuration) — nobody will be able to log in.'
    );
    return;
  }

  const db = getHouseholdDb('household-1');
  const insert = db.prepare(
    `INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)`
  );
  for (const p of parents) {
    insert.run(p.username, p.displayName, hashPassword(p.password));
    console.log(`Seeded account: ${p.username} (household-1)`);
  }
}
