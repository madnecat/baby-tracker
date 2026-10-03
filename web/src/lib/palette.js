import { t, tOr } from '../i18n/index.js';

// Entries carry `labelKey` (catalog key) plus a lazy `label` getter (resolved when read, never at
// import) so callers not yet migrated keep working. Prefer t(entry.labelKey) / eventTypeLabel().
function withLabel(colors, labelKey) {
  return {
    ...colors,
    labelKey,
    get label() {
      return t(labelKey);
    },
  };
}

/** Display name of a stored event type ('diaper' -> 'Diaper' / 'Couche'); unknown types show as stored. */
export function eventTypeLabel(type) {
  return tOr('events.type', type);
}

/** Display text of a WHO percentile id: '3rd' -> '3rd' (English) / '3e' (French). Unknown ids show as given. */
export function percentileLabel(id) {
  return tOr('growth.percentile', id);
}

// Categorical slots assigned in fixed order (never cycled/reassigned) — one per event type.
export const EVENT_COLORS = {
  diaper: withLabel({ light: '#2a78d6', dark: '#3987e5' }, 'events.type.diaper'), // slot 1 blue
  bottle: withLabel({ light: '#eb6834', dark: '#d95926' }, 'events.type.bottle'), // slot 2 orange
  breastfeeding: withLabel({ light: '#1baf7a', dark: '#199e70' }, 'events.type.breastfeeding'), // slot 3 aqua
  contraction: withLabel({ light: '#eda100', dark: '#c98500' }, 'events.type.contraction'), // slot 4 yellow
  outing: withLabel({ light: '#e87ba4', dark: '#d55181' }, 'events.type.outing'), // slot 5 magenta
  temperature: withLabel({ light: '#008300', dark: '#008300' }, 'events.type.temperature'), // slot 6 green
  medication: withLabel({ light: '#4a3aa7', dark: '#9085e9' }, 'events.type.medication'), // slot 7 violet
  sleep: withLabel({ light: '#e34948', dark: '#e66767' }, 'events.type.sleep'), // slot 8 red
  // Not a real event type (growth measurements live in their own table) — reuses
  // the sequential-blue median step for visual continuity with the WHO charts.
  growth: withLabel({ light: '#1c5cab', dark: '#3987e5' }, 'events.type.growth'),
};

// Within-diaper breakdown (wet vs dirty) is a magnitude/sub-category split of one
// series, not a between-type comparison — two steps of diaper's own blue hue,
// not another event type's identity color.
export const DIAPER_SUBTYPE_COLORS = {
  wet: { light: '#86b6ef', dark: '#2a78d6' },
  dirty: { light: '#1c5cab', dark: '#3987e5' },
};

// Sequential blue ramp for WHO percentile bands (magnitude, one hue, light->dark).
export const WHO_BAND_COLORS = {
  '3rd': { light: '#cde2fb', dark: '#184f95' },
  '15th': { light: '#86b6ef', dark: '#2a78d6' },
  '50th': { light: '#1c5cab', dark: '#3987e5' },
  '85th': { light: '#86b6ef', dark: '#2a78d6' },
  '97th': { light: '#cde2fb', dark: '#184f95' },
};

// The child's own measurement series stands out against the blue bands.
export const CHILD_SERIES_COLOR = { light: '#eb6834', dark: '#d95926' };

// Breastfeeding-notes card: categorical slots (validated with the dataviz script: CVD-safe, labels
// + a table twin cover the one light-mode contrast warning on the green). "none" is the neutral
// de-emphasis gray, "full" the single-hue fill of the after-feed meter.
export const FEED_NOTE_COLORS = {
  efficient: withLabel({ light: '#1baf7a', dark: '#199e70' }, 'feed.tag.efficient'),
  searching: withLabel({ light: '#eb6834', dark: '#d95926' }, 'feed.tag.searching'),
  other: withLabel({ light: '#2a78d6', dark: '#3987e5' }, 'feed.note.other'),
  none: withLabel({ light: '#c3c2b7', dark: '#4a4a46' }, 'feed.note.none'),
  full: withLabel({ light: '#eda100', dark: '#c98500' }, 'feed.after.satisfied'),
};

export const CHART_CHROME = {
  gridline: { light: '#e1e0d9', dark: '#2c2c2a' },
  axis: { light: '#c3c2b7', dark: '#383835' },
  mutedText: { light: '#898781', dark: '#898781' },
  primaryText: { light: '#0b0b0b', dark: '#ffffff' },
  surface: { light: '#fcfcfb', dark: '#1a1a19' },
};

export function resolve(colorRole, isDark) {
  return isDark ? colorRole.dark : colorRole.light;
}
