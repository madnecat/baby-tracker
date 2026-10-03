/**
 * Reads a number typed by a person: accepts a decimal comma ("2,5") as well as a point ("2.5"),
 * ignores surrounding spaces, and returns null for anything that is not a plain number (empty,
 * letters, "1,2,3", "1.2.3"). Everything stored and computed afterwards uses points.
 */
export function parseDecimal(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  if (typeof input !== 'string') return null;
  const text = input.trim().replace(/ | /g, '').replace(',', '.');
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** For `<input inputMode="decimal">` state: keeps what the person typed, but swaps a comma for a point. */
export function normaliseDecimalText(input) {
  return String(input ?? '').replace(',', '.');
}
