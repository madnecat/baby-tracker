/**
 * The typical day and the typical night over a week or more of sleep, as plain counts — no model.
 *
 * Between two logged sleeps there may be an awake gap. Its start is a "wake-up", its end a "sleep"
 * starting. Gaps shorter than WAKE_MIN_MINUTES are a feed or a cuddle and are ignored. Over the last
 * complete days this gives, for the night (20:00–08:00) how many times the child woke and for how long,
 * and for the day (08:00–20:00) how many sleeps started and how long the child was awake before each,
 * plus the times of day when these usually happen. It says there is no regular time when they are
 * spread through the period, which at a few weeks old is usually the truth. Local time throughout.
 */

const MIN = 60000;
const HOUR = 3600000;

export const DAY_START_HOUR = 8;
export const NIGHT_START_HOUR = 20;
/** An awake gap shorter than this between two sleeps is a feed or a cuddle, not a wake-up. */
export const WAKE_MIN_MINUTES = 15;
/** A gap longer than this is more likely sleep nobody logged than a real awake stretch. */
export const WAKE_MAX_MINUTES = 12 * 60;
/** A time counts as "usual" when this share of days (or nights) has an event within its window. */
export const REGULAR_SHARE = 0.6;
const STEP_MIN = 30;
export const DAY_STEPS = 1440 / STEP_MIN; // 48 half-hours
const WINDOW_MIN = 120;
const MAX_WINDOWS = 2;
const MIN_PERIODS = 3;

const median = (values) => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const minuteOfDay = (t) => {
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes();
};

// Minutes from `lo` forward to `m`, around the clock.
const offsetIn = (m, lo) => (m - lo + 1440) % 1440;

/** For each half-hour of the day, the share (0 to 1) of periods with at least one event inside it. */
function shareByStep(periods) {
  return Array.from({ length: DAY_STEPS }, (_, s) => {
    const lo = s * STEP_MIN;
    return periods.filter((p) => p.some((m) => m >= lo && m < lo + STEP_MIN)).length / periods.length;
  });
}

/**
 * Up to MAX_WINDOWS non-overlapping two-hour windows where at least REGULAR_SHARE of the periods have an
 * event, each tightened to where the events fell (at least half an hour wide), in clock order, as
 * { startMinute, endMinute, count } (minutes after midnight; endMinute may be smaller: it crossed midnight).
 */
function usualWindows(periods) {
  const all = [];
  for (let w = 0; w < DAY_STEPS; w += 1) {
    const lo = w * STEP_MIN;
    all.push({ lo, hit: periods.filter((p) => p.some((m) => offsetIn(m, lo) < WINDOW_MIN)).length });
  }
  const chosen = [];
  const overlaps = (a, b) => offsetIn(a.lo, b.lo) < WINDOW_MIN || offsetIn(b.lo, a.lo) < WINDOW_MIN;
  for (const w of all.sort((a, b) => b.hit - a.hit || a.lo - b.lo)) {
    if (w.hit / periods.length < REGULAR_SHARE) break;
    if (chosen.some((c) => overlaps(c, w))) continue;
    chosen.push(w);
    if (chosen.length === MAX_WINDOWS) break;
  }
  return chosen
    .sort((a, b) => a.lo - b.lo)
    .map((w) => {
      const offsets = periods.flatMap((p) => p.map((m) => offsetIn(m, w.lo))).filter((o) => o < WINDOW_MIN);
      const from = Math.min(...offsets) - 15;
      const to = Math.max(Math.max(...offsets) + 15, from + 30);
      return {
        startMinute: (((w.lo + from) % 1440) + 1440) % 1440,
        endMinute: (((w.lo + to) % 1440) + 1440) % 1440,
        count: w.hit,
      };
    });
}

function summarise(periods) {
  const counts = periods.map((p) => p.minutes.length);
  return {
    periods: periods.length,
    perPeriod: { median: median(counts), min: Math.min(...counts), max: Math.max(...counts) },
    medianMinutes: median(periods.flatMap((p) => p.minutes)),
    usual: usualWindows(periods.map((p) => p.at)),
  };
}

export const ASLEEP_SLOTS = 96; // quarter-hours

/**
 * For each quarter-hour of the day, the share (0 to 1) of days the child was asleep then. `rows` are the
 * timeline's days ({ from, to }) and `rowBlocks[i]` the sleep blocks of `rows[i]`; a slot that has not
 * happened yet on the current day is left out of that slot's average.
 */
export function asleepShare(rows, rowBlocks) {
  const slotMs = (24 * 60 * MIN) / ASLEEP_SLOTS;
  const sums = new Array(ASLEEP_SLOTS).fill(0);
  const seen = new Array(ASLEEP_SLOTS).fill(0);
  rows.forEach((row, i) => {
    for (let s = 0; s < ASLEEP_SLOTS; s += 1) {
      const from = row.from + s * slotMs;
      const to = from + slotMs;
      if (to > row.to) break;
      let asleep = 0;
      for (const b of rowBlocks[i]) asleep += Math.max(0, Math.min(b.end, to) - Math.max(b.start, from));
      sums[s] += asleep / slotMs;
      seen[s] += 1;
    }
  });
  return sums.map((sum, s) => (seen[s] ? sum / seen[s] : 0));
}

/**
 * `intervals` are normalised sleeps ({ start, effectiveEnd, suspect }); `days` is the size of the range
 * (the current, unfinished day is left out). Returns null when fewer than 3 complete days or nights have
 * anything logged. Otherwise
 * - night: wake-ups between 20:00 and 08:00 — { periods, perPeriod: { median, min, max }, medianMinutes
 *   (how long each wake-up lasted), usual (the usual times) }
 * - day: sleeps starting between 08:00 and 20:00 — the same, `medianMinutes` being the awake time
 *   before each sleep
 * - wakeShare / sleepShare: for the chart, per half-hour of the whole day, the share of days (day hours)
 *   or nights (night hours) with a wake-up / a sleep starting then
 */
export function rhythmSummary(intervals, now, days) {
  const good = intervals.filter((s) => !s.suspect).sort((a, b) => a.start - b.start);

  const gaps = [];
  for (let k = 1; k < good.length; k += 1) {
    const minutes = (good[k].start - good[k - 1].effectiveEnd) / MIN;
    if (minutes >= WAKE_MIN_MINUTES && minutes <= WAKE_MAX_MINUTES) {
      gaps.push({ wakeAt: good[k - 1].effectiveEnd, sleepAt: good[k].start, minutes });
    }
  }

  const nights = [];
  const dayPeriods = [];
  for (let i = days - 1; i >= 1; i -= 1) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(DAY_START_HOUR, 0, 0, 0);
    const dayFrom = d.getTime();
    const dayTo = dayFrom + (NIGHT_START_HOUR - DAY_START_HOUR) * HOUR;
    const nightTo = dayTo + (24 - NIGHT_START_HOUR + DAY_START_HOUR) * HOUR;
    const logged = (from, to) => good.some((s) => s.effectiveEnd > from && s.start < to);

    // `at` / `minutes`: what the text reports (sleeps starting in the day, wake-ups in the night);
    // `wakes` / `sleeps`: every wake-up and every sleep start of the period, for the chart.
    const period = (from, to, primary) => {
      const wakes = gaps.filter((g) => g.wakeAt >= from && g.wakeAt < to);
      const sleeps = gaps.filter((g) => g.sleepAt >= from && g.sleepAt < to);
      const main = primary === 'sleeps' ? sleeps : wakes;
      return {
        at: main.map((g) => minuteOfDay(primary === 'sleeps' ? g.sleepAt : g.wakeAt)),
        minutes: main.map((g) => g.minutes),
        wakes: wakes.map((g) => minuteOfDay(g.wakeAt)),
        sleeps: sleeps.map((g) => minuteOfDay(g.sleepAt)),
      };
    };
    if (dayTo <= now && logged(dayFrom, dayTo)) dayPeriods.push(period(dayFrom, dayTo, 'sleeps'));
    if (nightTo <= now && logged(dayTo, nightTo)) nights.push(period(dayTo, nightTo, 'wakes'));
  }
  if (nights.length < MIN_PERIODS || dayPeriods.length < MIN_PERIODS) return null;

  // The chart covers the whole day: day hours come from the day periods, night hours from the nights.
  const inNightHours = (s) => s * STEP_MIN >= NIGHT_START_HOUR * 60 || s * STEP_MIN < DAY_START_HOUR * 60;
  const blend = (key) => {
    const fromNights = shareByStep(nights.map((p) => p[key]));
    const fromDays = shareByStep(dayPeriods.map((p) => p[key]));
    return fromNights.map((value, s) => (inNightHours(s) ? value : fromDays[s]));
  };
  return {
    night: summarise(nights),
    day: summarise(dayPeriods),
    wakeShare: blend('wakes'),
    sleepShare: blend('sleeps'),
  };
}
