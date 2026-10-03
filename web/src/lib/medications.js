import { t } from '../i18n/index.js';
import { formatClock, formatDateTime, formatMinutes } from './dateUtils.js';

// Standard adult dosing intervals from NHS-published sources. Not medical advice —
// always follow your own prescription or the packet instructions instead if they differ.
//
// `name` is the STORED identifier (kept in event details and matched against history) - never
// translate or change it. `labelKey` is the display name (use medicationDisplayName(name)); the
// `warning` getters resolve lazily so nothing is translated at import time. Prefer presetWarning().
export const MEDICATION_PRESETS = [
  // NHS allows 1g every 4-6h (max 4g/24h); 6h is the spacing this household was told to use.
  { key: 'paracetamol', name: 'Paracetamol', labelKey: 'medication.preset.paracetamol', doseAmount: 1, doseUnit: 'g', intervalHours: 6 },
  { key: 'ibuprofen', name: 'Ibuprofen', labelKey: 'medication.preset.ibuprofen', doseAmount: 400, doseUnit: 'mg', intervalHours: 6 },
  {
    key: 'diclofenac',
    name: 'Diclofenac',
    labelKey: 'medication.preset.diclofenac',
    doseAmount: 100,
    doseUnit: 'mg',
    intervalHours: 12,
    warningKey: 'medication.warning.diclofenac',
    get warning() {
      return t(this.warningKey);
    },
  },
  {
    key: 'dihydrocodeine',
    name: 'Dihydrocodeine',
    labelKey: 'medication.preset.dihydrocodeine',
    doseAmount: 30,
    doseUnit: 'mg',
    intervalHours: 6,
    warningKey: 'medication.warning.dihydrocodeine',
    get warning() {
      return t(this.warningKey);
    },
  },
  {
    key: 'co-codamol',
    name: 'Co-codamol (codeine)',
    labelKey: 'medication.preset.coCodamol',
    doseAmount: null,
    doseUnit: null,
    intervalHours: 6,
    warningKey: 'medication.warning.coCodamol',
    get warning() {
      return t(this.warningKey);
    },
  },
];

/** Translated warning text for a preset (null when it has none). */
export function presetWarning(preset) {
  return preset?.warningKey ? t(preset.warningKey) : null;
}

/** Display name of a medication: a built-in preset's English name becomes its translated label;
 * any other (custom, user-typed) name is returned exactly as stored. */
export function medicationDisplayName(name) {
  const preset = MEDICATION_PRESETS.find((p) => p.name === name);
  return preset ? t(preset.labelKey) : name;
}

function computeNextSafeAt(startedAt, intervalHours) {
  if (typeof intervalHours !== 'number' || Number.isNaN(intervalHours) || intervalHours < 0) return null;
  return new Date(startedAt).getTime() + intervalHours * 3600000;
}

/** Cooldown status for a medication name, from its most recent dose (or null if never logged). */
export function getMedicationStatus(lastDose, now = Date.now()) {
  if (!lastDose) return { sub: t('medication.status.none'), safe: true, nextSafeAt: null };
  const nextSafeAt = computeNextSafeAt(lastDose.startedAt, lastDose.details?.intervalHours);
  if (nextSafeAt == null) return { sub: t('medication.status.unknownInterval'), safe: true, nextSafeAt: null };
  if (now >= nextSafeAt) return { sub: t('medication.status.safe'), safe: true, nextSafeAt };
  const remainingMin = Math.ceil((nextSafeAt - now) / 60000);
  return {
    sub: t('medication.status.wait', {
      duration: formatMinutes(remainingMin, { pad: false }),
      time: formatClock(nextSafeAt),
    }),
    safe: false,
    nextSafeAt,
  };
}

/** When a specific logged dose's own next-dose-safe time falls, or null if it has no valid interval. */
export function nextDoseInfo(event, now = Date.now()) {
  const nextSafeAt = computeNextSafeAt(event.startedAt, event.details?.intervalHours);
  if (nextSafeAt == null) return null;
  return {
    nextSafeAt,
    safe: now >= nextSafeAt,
    label: t('medication.nextDose', { when: formatDateTime(new Date(nextSafeAt).toISOString()) }),
  };
}

/** Who a logged dose belongs to. Doses logged before baby medication existed have no `who`
 * and were all mum's, so anything that isn't explicitly 'baby' is mum. */
export function medicationWho(event) {
  return event.details?.who === 'baby' ? 'baby' : 'mom';
}

/** Medication events for one person, keeping the input order (newest-first from the API). */
export function medicationsFor(medicationEvents, who) {
  return medicationEvents.filter((e) => medicationWho(e) === who);
}

/** Built-in presets are adult doses for mum; baby medication is entirely user-defined ("Other"). */
function presetsFor(who) {
  return who === 'baby' ? [] : MEDICATION_PRESETS;
}

/** All known medication names: presets first (in preset order), then any extra names seen in
 * logged events, alphabetically. `medicationEvents` order doesn't matter here. Pass events
 * already filtered with medicationsFor(); `who` only decides whether mum's presets apply.
 * These are STORED names - show them with medicationDisplayName(). */
export function getMedicationNames(medicationEvents, who = 'mom') {
  const presetNames = presetsFor(who).map((p) => p.name);
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
export function loggedMedicationNames(medicationEvents, who = 'mom') {
  const logged = new Set(medicationEvents.map((e) => e.details?.name).filter(Boolean));
  return getMedicationNames(medicationEvents, who).filter((n) => logged.has(n));
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
export function getCustomPresets(medicationEvents, who = 'mom') {
  const presetNames = new Set(presetsFor(who).map((p) => p.name));
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
