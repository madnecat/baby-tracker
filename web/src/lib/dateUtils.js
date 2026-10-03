import { differenceInMilliseconds, differenceInCalendarDays, format, formatDistanceStrict } from 'date-fns';
import { t, dateFnsLocale, intlLocale } from '../i18n/index.js';

export function ageInMonths(dateOfBirth, atDate = new Date()) {
  const dob = new Date(dateOfBirth);
  const at = new Date(atDate);
  const msPerMonth = (365.2425 / 12) * 24 * 60 * 60 * 1000;
  return differenceInMilliseconds(at, dob) / msPerMonth;
}

/** Timer-style duration between two instants (end defaults to now): "1h 05m" or "5m 03s". */
export function formatDuration(startedAt, endedAt) {
  const start = new Date(startedAt);
  const end = endedAt ? new Date(endedAt) : new Date();
  const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return t('time.hm', { h, m: String(m).padStart(2, '0') });
  return t('time.ms', { m, s: String(s).padStart(2, '0') });
}

/**
 * A length in minutes (fractions are rounded): "1h 05m" from an hour up, "5m" below.
 * `{ pad: false }` writes the minutes of an hour-plus value without the leading zero ("2h 5m").
 */
export function formatMinutes(minutes, { pad = true } = {}) {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0) return t('time.hm', { h, m: pad ? String(m).padStart(2, '0') : m });
  return t('time.m', { m });
}

/** A length in milliseconds, short form for chart axes/tooltips: "45s", "2m 30s", "12m", "1h", "1h 5m". */
export function formatDurationMs(ms) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return t('time.s', { s: seconds });
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    const s = seconds % 60;
    return s === 0 || minutes >= 10
      ? t('time.m', { m: minutes })
      : t('time.ms', { m: Math.floor(seconds / 60), s });
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? t('time.h', { h }) : t('time.hm', { h, m });
}

/** "12m ago" / "il y a 12 min": how long since an ISO string / Date / epoch ms (never negative). */
export function formatAgo(when, now = Date.now()) {
  const minutes = Math.max(0, (now - new Date(when).getTime()) / 60000);
  return t('time.ago', { duration: formatMinutes(minutes) });
}

/** A wall-clock time in 24 h for the app language ("14:30"); replaces toLocaleTimeString([]). */
export function formatClock(when) {
  return new Intl.DateTimeFormat(intlLocale(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(when)
  );
}

/** A clock time, prefixed with "Yesterday" when it is not on the same day as `now`. */
export function formatMoment(when, now = Date.now()) {
  return new Date(when).toDateString() === new Date(now).toDateString()
    ? formatClock(when)
    : t('time.yesterdayAt', { time: formatClock(when) });
}

export function formatDateTime(iso) {
  return format(new Date(iso), 'EEE d MMM, HH:mm', { locale: dateFnsLocale() });
}

export function formatDateOnly(iso) {
  return format(new Date(iso), 'EEE d MMM yyyy', { locale: dateFnsLocale() });
}

export function formatRelative(iso) {
  return formatDistanceStrict(new Date(iso), new Date(), { addSuffix: true, locale: dateFnsLocale() });
}

/** Short day label for chart axes ("3 Oct" / "3 oct."); the 'yyyy-MM-dd' day key stays separate. */
export function formatDayShort(date) {
  return format(new Date(date), 'd MMM', { locale: dateFnsLocale() });
}

export function dayKey(iso) {
  return format(new Date(iso), 'yyyy-MM-dd');
}

export function daysAgo(iso) {
  return differenceInCalendarDays(new Date(), new Date(iso));
}

/**
 * Gap in minutes for the sleep card: '1h 05m' from an hour up, otherwise '30 min' (words, not an
 * 'm' suffix) — the wording the card has always used.
 */
export function formatGap(minutes) {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? t('time.hm', { h, m: String(m).padStart(2, '0') }) : t('time.minutes', { m });
}
