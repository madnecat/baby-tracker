import { eachDayOfInterval, format, startOfDay, subDays } from 'date-fns';

/**
 * Buckets events into one row per calendar day across `days` back from today
 * (zero-filled so the x-axis stays evenly spaced), reducing each day's events
 * with `reducer(acc, event)` starting from `initial()`.
 */
export function aggregateByDay(events, days, initial, reducer) {
  const end = startOfDay(new Date());
  const start = subDays(end, days - 1);
  const buckets = new Map(
    eachDayOfInterval({ start, end }).map((d) => [format(d, 'yyyy-MM-dd'), initial()])
  );

  for (const event of events) {
    const key = format(new Date(event.startedAt), 'yyyy-MM-dd');
    if (!buckets.has(key)) continue;
    buckets.set(key, reducer(buckets.get(key), event));
  }

  return [...buckets.entries()].map(([day, value]) => ({
    day: format(new Date(day), 'd MMM'),
    ...value,
  }));
}
