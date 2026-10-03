import { parseDecimal } from './parseDecimal.js';

/**
 * Reads a number from the raw text of a decimal input ("2,5" and "2.5" both work).
 * Returns { value, invalid }: a blank optional field gives { value: null, invalid: false };
 * anything unreadable, blank-but-required, or outside min/max gives { value: null, invalid: true }.
 * `min`/`max` are inclusive unless `minExclusive` is set.
 */
export function readNumberField(text, { required = false, min, max, minExclusive = false } = {}) {
  if (String(text ?? '').trim() === '') return { value: null, invalid: required };
  const value = parseDecimal(String(text));
  if (value === null) return { value: null, invalid: true };
  if (min !== undefined && (minExclusive ? value <= min : value < min)) return { value: null, invalid: true };
  if (max !== undefined && value > max) return { value: null, invalid: true };
  return { value, invalid: false };
}
