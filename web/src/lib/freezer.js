import { intlLocale, t } from '../i18n/index.js';

// Helpers for the freezer screens. Freezing and expiry dates are plain calendar dates
// ('YYYY-MM-DD'), never instants: they are shown as written, with no time-zone shift.

export const SHELF_LIFE_MONTHS = 4;

/** The device's calendar date as 'YYYY-MM-DD' (what a person means by "today"). */
export function localToday(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Adds calendar months, clamping to the end of a shorter month (31 Oct + 4 months = 28 Feb). Mirrors the server. */
export function addMonths(date, months) {
  const [y, mo, d] = date.split('-').map(Number);
  const index = y * 12 + (mo - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pad = (n) => String(n).padStart(2, '0');
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(Math.min(d, lastDay))}`;
}

/** "25 Oct 2026" / "25 oct. 2026" for a calendar date. */
export function formatCalendarDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return '';
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(intlLocale(), {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** { count, totalMl, nextExpiryOn } for the bags in the freezer (nextExpiryOn is null when empty). */
export function summarize(bags) {
  let nextExpiryOn = null;
  let totalMl = 0;
  for (const bag of bags) {
    totalMl += bag.quantityMl;
    if (nextExpiryOn === null || bag.expiresOn < nextExpiryOn) nextExpiryOn = bag.expiresOn;
  }
  return { count: bags.length, totalMl, nextExpiryOn };
}

/** "1", "1 and 5", "1, 5 and 9" — the bag numbers, in the language of the app. */
export function listReferences(references) {
  const sorted = [...references].sort((a, b) => a - b).map(String);
  return new Intl.ListFormat(intlLocale(), { style: 'long', type: 'conjunction' }).format(sorted);
}

/** How close a bag is to its date: 'urgent' (3 days or fewer), 'soon' (7 or fewer) or 'ok'. */
export function urgencyOf(daysLeft) {
  if (daysLeft <= 3) return 'urgent';
  if (daysLeft <= 7) return 'soon';
  return 'ok';
}

/** "3 days left" / "last day today" for a bag in the freezer. */
export function daysLeftText(daysLeft) {
  if (daysLeft <= 0) return t('freezer.bag.expiresToday');
  return t('freezer.bag.expiresIn', { count: daysLeft });
}

/** Whole, positive millilitres typed in a field, else null (so "50.5", "abc" and "" are all refused). */
export function readWholeMl(text, max) {
  const trimmed = String(text ?? '').trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (value <= 0 || (max !== undefined && value > max)) return null;
  return value;
}
