import { formatDateTime } from './dateUtils.js';

// Standard adult dosing intervals from NHS-published sources. Not medical advice —
// always follow your own prescription or the packet instructions instead if they differ.
export const MEDICATION_PRESETS = [
  { key: 'paracetamol', name: 'Paracetamol', doseAmount: 1, doseUnit: 'g', intervalHours: 4 },
  { key: 'ibuprofen', name: 'Ibuprofen', doseAmount: 400, doseUnit: 'mg', intervalHours: 6 },
  {
    key: 'diclofenac',
    name: 'Diclofenac',
    doseAmount: 100,
    doseUnit: 'mg',
    intervalHours: 12,
    warning:
      'Max 150mg per 24h. Often only continued short-term after a hospital dose — check with your midwife/GP before repeating at home.',
  },
  {
    key: 'dihydrocodeine',
    name: 'Dihydrocodeine',
    doseAmount: 30,
    doseUnit: 'mg',
    intervalHours: 6,
    warning:
      'An opioid — NHS guidance says it can be used short-term while breastfeeding, with caution. Watch baby for unusual sleepiness, feeding difficulty, or breathing changes, and use the lowest effective dose for the shortest time.',
  },
  {
    key: 'co-codamol',
    name: 'Co-codamol (codeine)',
    doseAmount: null,
    doseUnit: null,
    intervalHours: 6,
    warning:
      'NHS/MHRA advise AGAINST codeine while breastfeeding — around 3% of people are "ultra-rapid metabolisers" and pass unsafe amounts to their baby through milk, which has caused serious harm in rare cases. If you\'ve been prescribed this, talk to your GP/midwife about dihydrocodeine or paracetamol/ibuprofen instead.',
  },
];

function computeNextSafeAt(startedAt, intervalHours) {
  if (typeof intervalHours !== 'number' || Number.isNaN(intervalHours) || intervalHours < 0) return null;
  return new Date(startedAt).getTime() + intervalHours * 3600000;
}

/** Cooldown status for a medication name, from its most recent dose (or null if never logged). */
export function getMedicationStatus(lastDose, now = Date.now()) {
  if (!lastDose) return { sub: 'Not logged recently', safe: true, nextSafeAt: null };
  const nextSafeAt = computeNextSafeAt(lastDose.startedAt, lastDose.details?.intervalHours);
  if (nextSafeAt == null) return { sub: 'Logged (interval unknown)', safe: true, nextSafeAt: null };
  if (now >= nextSafeAt) return { sub: 'Safe to take now', safe: true, nextSafeAt };
  const remainingMin = Math.ceil((nextSafeAt - now) / 60000);
  const h = Math.floor(remainingMin / 60);
  const m = remainingMin % 60;
  const nextTime = new Date(nextSafeAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return { sub: `Wait ${h > 0 ? `${h}h ` : ''}${m}m (until ${nextTime})`, safe: false, nextSafeAt };
}

/** When a specific logged dose's own next-dose-safe time falls, or null if it has no valid interval. */
export function nextDoseInfo(event, now = Date.now()) {
  const nextSafeAt = computeNextSafeAt(event.startedAt, event.details?.intervalHours);
  if (nextSafeAt == null) return null;
  return {
    nextSafeAt,
    safe: now >= nextSafeAt,
    label: `Next dose safe from ${formatDateTime(new Date(nextSafeAt).toISOString())}`,
  };
}

/** All known medication names: presets first (in preset order), then any extra names seen in
 * logged events, alphabetically. `medicationEvents` order doesn't matter here. */
export function getMedicationNames(medicationEvents) {
  const presetNames = MEDICATION_PRESETS.map((p) => p.name);
  const seen = new Set(presetNames);
  const extra = [];
  for (const e of medicationEvents) {
    const name = e.details?.name;
    if (name && !seen.has(name)) {
      seen.add(name);
      extra.push(name);
    }
  }
  extra.sort((a, b) => a.localeCompare(b));
  return [...presetNames, ...extra];
}

/** Same ordering as getMedicationNames, filtered down to names with at least one logged dose. */
export function loggedMedicationNames(medicationEvents) {
  const logged = new Set(medicationEvents.map((e) => e.details?.name).filter(Boolean));
  return getMedicationNames(medicationEvents).filter((n) => logged.has(n));
}

/** Most recent event for a given medication name, or null. Relies on medicationEvents being
 * newest-first, which is how the API returns events (server orders by started_at DESC). */
export function lastDoseFor(medicationEvents, name) {
  return medicationEvents.find((e) => e.details?.name === name) || null;
}

/** Preset-shaped objects for custom ("Other") medication names that have been logged at least
 * once, so they can render as their own MedicationTile — defaults taken from the most recent
 * dose of that name. Presets already in MEDICATION_PRESETS are excluded (they have their own
 * fixed entry already). */
export function getCustomPresets(medicationEvents) {
  const presetNames = new Set(MEDICATION_PRESETS.map((p) => p.name));
  const seen = new Set();
  const customPresets = [];
  for (const e of medicationEvents) {
    const name = e.details?.name;
    if (!name || presetNames.has(name) || seen.has(name)) continue;
    seen.add(name);
    customPresets.push({
      // Prefixed so this can never collide with a MEDICATION_PRESETS `key` (e.g. a custom name
      // typed as "paracetamol" would otherwise share the preset's internal key 'paracetamol').
      key: `custom:${name}`,
      name,
      doseAmount: e.details.doseAmount ?? null,
      doseUnit: e.details.doseUnit ?? null,
      intervalHours: e.details.intervalHours,
    });
  }
  customPresets.sort((a, b) => a.name.localeCompare(b.name));
  return customPresets;
}
