import fs from 'node:fs';
import { listHouseholdSlugs, provisionHousehold, reconcileHouseholdUsernames } from './households.js';

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
  };
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
    reconcileHouseholdUsernames(slug, parents);
    return;
  }

  try {
    provisionHousehold(slug, parents);
    for (const p of parents) console.log(`Seeded account: ${p.username} (${slug})`);
  } catch (e) {
    console.error(`Could not provision household "${slug}": ${e.message}`);
  }
}
