// Categorical slots assigned in fixed order (never cycled/reassigned) — one per event type.
export const EVENT_COLORS = {
  diaper: { light: '#2a78d6', dark: '#3987e5', label: 'Diaper' }, // slot 1 blue
  bottle: { light: '#eb6834', dark: '#d95926', label: 'Bottle' }, // slot 2 orange
  breastfeeding: { light: '#1baf7a', dark: '#199e70', label: 'Breastfeeding' }, // slot 3 aqua
  contraction: { light: '#eda100', dark: '#c98500', label: 'Contraction' }, // slot 4 yellow
  outing: { light: '#e87ba4', dark: '#d55181', label: 'Outing' }, // slot 5 magenta
  temperature: { light: '#008300', dark: '#008300', label: 'Temperature' }, // slot 6 green
  medication: { light: '#4a3aa7', dark: '#9085e9', label: 'Medication' }, // slot 7 violet
  sleep: { light: '#e34948', dark: '#e66767', label: 'Sleep' }, // slot 8 red
  // Not a real event type (growth measurements live in their own table) — reuses
  // the sequential-blue median step for visual continuity with the WHO charts.
  growth: { light: '#1c5cab', dark: '#3987e5', label: 'Growth' },
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
