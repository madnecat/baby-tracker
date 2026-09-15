import fs from 'node:fs';
import {
  listConfigListHouseholdSlugs,
  listHouseholdSlugs,
  markConfigListHouseholdRemoved,
  provisionHousehold,
  reconcileHouseholdUsernames,
  syncConfigListHousehold,
} from './households.js';

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
    household2_slug: process.env.HOUSEHOLD2_SLUG,
    household2_parent1_username: process.env.HOUSEHOLD2_PARENT1_USERNAME,
    household2_parent1_password: process.env.HOUSEHOLD2_PARENT1_PASSWORD,
    household2_parent1_display_name: process.env.HOUSEHOLD2_PARENT1_DISPLAY_NAME,
    household2_parent2_username: process.env.HOUSEHOLD2_PARENT2_USERNAME,
    household2_parent2_password: process.env.HOUSEHOLD2_PARENT2_PASSWORD,
    household2_parent2_display_name: process.env.HOUSEHOLD2_PARENT2_DISPLAY_NAME,
    households: parseHouseholdsEnv(process.env.HOUSEHOLDS_JSON),
  };
}

function parseHouseholdsEnv(json) {
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch {
    console.error('HOUSEHOLDS_JSON is not valid JSON — ignoring it.');
    return [];
  }
}

/**
 * Seeds the very first household ("household-1") from the add-on's
 * Configuration options, but only if household-1 doesn't already exist
 * (including one just moved into place by migrateLegacySingleHouseholdDb) —
 * checked specifically, not "any household exists", so this still behaves
 * correctly even if some other household happens to have been provisioned
 * first.
 */
export function bootstrapFirstHousehold() {
  if (listHouseholdSlugs().includes('household-1')) return;

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

  provisionHousehold('household-1', parents);
  for (const p of parents) console.log(`Seeded account: ${p.username} (household-1)`);
}

/**
 * Provisions a second household from the add-on's Configuration options,
 * when `household2_slug` is set — a convenience for onboarding one more
 * family without needing shell access to the running container (which
 * scripts/create-household.js requires). Provisioning itself is one-time
 * (once a household with that slug exists, it's never re-created), but on
 * every later boot this also reconciles usernames against the current
 * config, so fixing a typo in the add-on's Configuration UI and restarting
 * actually takes effect instead of being silently ignored.
 */
export function bootstrapAdditionalHouseholds() {
  const options = loadOptions();
  const slug = options.household2_slug;
  if (!slug) return;

  const parents = [
    {
      username: options.household2_parent1_username,
      password: options.household2_parent1_password,
      displayName: options.household2_parent1_display_name || options.household2_parent1_username,
    },
    {
      username: options.household2_parent2_username,
      password: options.household2_parent2_password,
      displayName: options.household2_parent2_display_name || options.household2_parent2_username,
    },
  ].filter((p) => p.username && p.password);

  if (parents.length === 0) return;

  if (listHouseholdSlugs().includes(slug)) {
    try {
      reconcileHouseholdUsernames(slug, parents);
    } catch (e) {
      console.error(`Could not reconcile household "${slug}": ${e.message}`);
    }
    return;
  }

  try {
    provisionHousehold(slug, parents);
    for (const p of parents) console.log(`Seeded account: ${p.username} (${slug})`);
  } catch (e) {
    console.error(`Could not provision household "${slug}": ${e.message}`);
  }
}

/**
 * Creates/updates every household declared in the add-on's `households` list
 * option (Settings → Add-ons → Baby Tracker → Configuration), so any number
 * of families can be onboarded without shell access. Entirely separate from
 * household-1 and household2, which keep their own options and code paths:
 * an entry can never modify a household it didn't create (see
 * syncConfigListHousehold). Each entry is handled on its own, so a bad one is
 * logged and skipped without affecting the others or the boot.
 */
export function bootstrapListedHouseholds() {
  const options = loadOptions();
  const entries = Array.isArray(options.households) ? options.households : [];
  const reserved = new Set(['household-1', options.household2_slug].filter(Boolean));
  const seen = new Set();

  entries.forEach((entry, index) => {
    const slug = entry?.slug;
    const label = slug ? `"households" entry "${slug}"` : `"households" entry #${index + 1}`;
    try {
      if (!slug) throw new Error('slug is empty.');
      if (reserved.has(slug)) throw new Error('this slug is already used by household-1 or household2.');
      if (seen.has(slug)) throw new Error('this slug appears more than once in the list; only the first is used.');
      seen.add(slug);

      const slots = [1, 2].map((n) => {
        const username = entry[`parent${n}_username`];
        const password = entry[`parent${n}_password`];
        if (!username && !password) return null;
        if (!username || !password) {
          console.warn(`${label}: parent${n} needs both a username and a password — skipping that parent.`);
          return null;
        }
        return { username, password, displayName: entry[`parent${n}_display_name`] || username };
      });
      if (!slots.some(Boolean)) throw new Error('no parent with both a username and a password.');

      syncConfigListHousehold(slug, slots);
    } catch (e) {
      console.error(`Skipping ${label}: ${e.message}`);
    }
  });

  const listedSlugs = new Set(entries.map((entry) => entry?.slug).filter(Boolean));
  for (const slug of listConfigListHouseholdSlugs()) {
    if (listedSlugs.has(slug)) continue;
    try {
      markConfigListHouseholdRemoved(slug);
    } catch (e) {
      console.error(`Could not record household "${slug}" as removed from the list: ${e.message}`);
    }
  }
}
