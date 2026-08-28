import { differenceInMilliseconds, differenceInCalendarDays, format, formatDistanceStrict } from 'date-fns';

export function ageInMonths(dateOfBirth, atDate = new Date()) {
  const dob = new Date(dateOfBirth);
  const at = new Date(atDate);
  const msPerMonth = (365.2425 / 12) * 24 * 60 * 60 * 1000;
  return differenceInMilliseconds(at, dob) / msPerMonth;
}

export function formatDuration(startedAt, endedAt) {
  const start = new Date(startedAt);
  const end = endedAt ? new Date(endedAt) : new Date();
  const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export function formatDateTime(iso) {
  return format(new Date(iso), 'EEE d MMM, HH:mm');
}

export function formatDateOnly(iso) {
  return format(new Date(iso), 'EEE d MMM yyyy');
}

export function formatRelative(iso) {
  return formatDistanceStrict(new Date(iso), new Date(), { addSuffix: true });
}

export function dayKey(iso) {
  return format(new Date(iso), 'yyyy-MM-dd');
}

export function daysAgo(iso) {
  return differenceInCalendarDays(new Date(), new Date(iso));
}
