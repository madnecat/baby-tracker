// Calendar-date helpers for the freezer. Dates are plain 'YYYY-MM-DD' strings in the household's
// local time (Europe/London, as the MCP reports); nothing here depends on the server's time zone.

export const HOUSEHOLD_TIME_ZONE = 'Europe/London';
export const DEFAULT_SHELF_LIFE_MONTHS = 4;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDate(value) {
  if (typeof value !== 'string') return false;
  const m = DATE_PATTERN.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

function format(y, mo, d) {
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Today's calendar date in the household's time zone. */
export function todayInHousehold(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: HOUSEHOLD_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Hour of the day (0-23) in the household's time zone. */
export function hourInHousehold(now = new Date()) {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: HOUSEHOLD_TIME_ZONE,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  return Number(hour);
}

/** Adds calendar months, clamping to the end of a shorter month (31 Oct + 4 months = 28 Feb). */
export function addMonths(date, months) {
  const [y, mo, d] = date.split('-').map(Number);
  const index = y * 12 + (mo - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return format(year, month, Math.min(d, lastDay));
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from, to) {
  const toUtc = (s) => {
    const [y, mo, d] = s.split('-').map(Number);
    return Date.UTC(y, mo - 1, d);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86400000);
}
