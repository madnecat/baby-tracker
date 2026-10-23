/**
 * The Charts page's time filter is remembered on this device, so reopening the page (a refresh,
 * a visit three hours later) shows the period last chosen. Storage can be blocked or empty
 * (private mode), so every access is guarded and the page just falls back to its default.
 */

export const RANGE_STORAGE_KEY = 'baby-tracker.charts.rangeDays';

/** The saved number of days if it is one of `allowed`, otherwise `fallback`. */
export function loadRangeDays(allowed, fallback, storage = globalThis.localStorage) {
  try {
    const saved = Number(storage?.getItem(RANGE_STORAGE_KEY));
    return allowed.includes(saved) ? saved : fallback;
  } catch {
    return fallback;
  }
}

export function saveRangeDays(days, storage = globalThis.localStorage) {
  try {
    storage?.setItem(RANGE_STORAGE_KEY, String(days));
  } catch {
    // The choice then only lasts for this visit.
  }
}
