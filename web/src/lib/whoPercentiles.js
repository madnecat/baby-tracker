import weightForAgeBoys from '../data/who/weight-for-age-boys.json';
import weightForAgeGirls from '../data/who/weight-for-age-girls.json';
import lengthHeightForAgeBoys from '../data/who/length-height-for-age-boys.json';
import lengthHeightForAgeGirls from '../data/who/length-height-for-age-girls.json';
import headCircumferenceForAgeBoys from '../data/who/head-circumference-for-age-boys.json';
import headCircumferenceForAgeGirls from '../data/who/head-circumference-for-age-girls.json';

const TABLES = {
  weight: { male: weightForAgeBoys, female: weightForAgeGirls },
  height: { male: lengthHeightForAgeBoys, female: lengthHeightForAgeGirls },
  headCircumference: { male: headCircumferenceForAgeBoys, female: headCircumferenceForAgeGirls },
};

// Standard WHO percentile band z-scores.
export const PERCENTILE_BANDS = [
  { label: '3rd', z: -1.8808 },
  { label: '15th', z: -1.0364 },
  { label: '50th', z: 0 },
  { label: '85th', z: 1.0364 },
  { label: '97th', z: 1.8808 },
];

function getTable(indicator, sex) {
  const table = TABLES[indicator]?.[sex];
  if (!table) throw new Error(`No WHO table for indicator=${indicator} sex=${sex}`);
  return table;
}

/** Linearly interpolate L/M/S at an exact (possibly fractional) age in months. */
function interpolateLMS(table, ageMonths) {
  const maxAge = table[table.length - 1].ageMonths;
  const clamped = Math.min(Math.max(ageMonths, 0), maxAge);

  let lo = table[0];
  let hi = table[table.length - 1];
  for (let i = 0; i < table.length - 1; i++) {
    if (table[i].ageMonths <= clamped && clamped <= table[i + 1].ageMonths) {
      lo = table[i];
      hi = table[i + 1];
      break;
    }
  }
  if (lo.ageMonths === hi.ageMonths) return lo;
  const t = (clamped - lo.ageMonths) / (hi.ageMonths - lo.ageMonths);
  return {
    ageMonths: clamped,
    L: lo.L + t * (hi.L - lo.L),
    M: lo.M + t * (hi.M - lo.M),
    S: lo.S + t * (hi.S - lo.S),
  };
}

/** Value of the given indicator at (ageMonths, z-score) per the WHO LMS formula. */
function valueAtZ({ L, M, S }, z) {
  if (Math.abs(L) < 1e-9) return M * Math.exp(S * z);
  return M * Math.pow(1 + L * S * z, 1 / L);
}

/** Convert an actual measurement to a z-score at the given age. */
export function measurementToZ(indicator, sex, ageMonths, value) {
  const { L, M, S } = interpolateLMS(getTable(indicator, sex), ageMonths);
  if (Math.abs(L) < 1e-9) return Math.log(value / M) / S;
  return (Math.pow(value / M, L) - 1) / (L * S);
}

/** Rough percentile (0-100) from a z-score, using a standard-normal CDF approximation. */
export function zToPercentile(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  let p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) p = 1 - p;
  return Math.round(p * 1000) / 10;
}

/**
 * Percentile band curves for charting: one series per age row in the reference
 * table, each with the value of every standard percentile band at that age.
 */
export function getPercentileCurves(indicator, sex) {
  const table = getTable(indicator, sex);
  return table.map((row) => {
    const point = { ageMonths: row.ageMonths };
    for (const band of PERCENTILE_BANDS) {
      point[band.label] = Math.round(valueAtZ(row, band.z) * 100) / 100;
    }
    return point;
  });
}

/** Where the child's own measurement sits: z-score + approximate percentile. */
export function placeMeasurement(indicator, sex, ageMonths, value) {
  const z = measurementToZ(indicator, sex, ageMonths, value);
  return { ageMonths, value, z, percentile: zToPercentile(z) };
}
