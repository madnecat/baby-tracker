/**
 * Deterministic generator of realistic sleep logs, for testing the prediction engine.
 *
 * Imports nothing, like sleep.js, so `node --test` runs it on a bare clone. Everything is driven by
 * a seeded PRNG, so a failing test fails the same way twice.
 *
 * What it is for: the engine has to answer "which phase is this child in" and "is this a passing
 * disturbance or a real regression", and neither question can be answered from this family's data
 * for months. So the profiles below stand in for the ages we cannot observe yet — a newborn with no
 * rhythm, a night consolidating, a settled nap regime, and the things that break them.
 *
 * What it is NOT: evidence that the thresholds are right. These profiles encode my assumptions
 * about infant sleep; a test built on them proves the engine behaves consistently with those
 * assumptions, not that the assumptions match this child. That is what the sensitivity sweep in
 * sleep.test.js is for — it shows the answer does not sit on a cliff edge.
 */

const MINUTE = 60000;
const HOUR = 3600000;

/** mulberry32 — small, fast, and identical across runs and platforms. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rng, mean, sd, min, max) {
  const u = Math.max(rng(), 1e-9);
  const v = rng();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.min(max, Math.max(min, mean + z * sd));
}

function startOfLocalDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function addLocalDays(t, n) {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

/** A local wall-clock hour on the given day. Hours >= 24 spill into the next day. */
function atLocalHour(dayStart, hour) {
  return addLocalDays(dayStart, Math.floor(hour / 24)) + (hour % 24) * HOUR;
}

function lerp(a, b, t) {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

// ---------------------------------------------------------------------------
// Day shapes
// ---------------------------------------------------------------------------

/**
 * No rhythm at all: sleeps of 1.5-3h separated by short wake windows, right around the clock.
 * This is the shape the app has to handle today.
 */
function unstructuredDay(dayStart, rng, { wakeMean = 55, wakeSd = 15, sleepMean = 125, sleepSd = 35 }) {
  const sleeps = [];
  let t = dayStart + gauss(rng, 30, 20, 0, 90) * MINUTE;
  const dayEnd = addLocalDays(dayStart, 1);
  while (t < dayEnd) {
    const duration = gauss(rng, sleepMean, sleepSd, 40, 240);
    sleeps.push({ start: t, end: t + duration * MINUTE });
    t += (duration + gauss(rng, wakeMean, wakeSd, 20, 130)) * MINUTE;
  }
  return sleeps;
}

/**
 * A night plus a set of naps. `nightHours` and the nap list drive whether this reads as phase 2
 * (a real night, naps still ragged) or phase 3 (a settled regime).
 */
function structuredDay(dayStart, rng, { nightStart, nightHours, naps, nightWakes = 0, jitter = 20 }) {
  const sleeps = [];
  const start = atLocalHour(dayStart, nightStart) + gauss(rng, 0, jitter, -60, 60) * MINUTE;
  const total = nightHours * 60 + gauss(rng, 0, jitter, -60, 60);

  if (nightWakes <= 0) {
    sleeps.push({ start, end: start + total * MINUTE });
  } else {
    // A broken night: the same total, cut into chunks by wakes. This is what teething, travel and
    // growth spurts all look like in the data.
    const chunk = total / (nightWakes + 1);
    let t = start;
    for (let i = 0; i <= nightWakes; i += 1) {
      const len = chunk + gauss(rng, 0, 15, -30, 30);
      sleeps.push({ start: t, end: t + len * MINUTE });
      t += (len + gauss(rng, 40, 12, 15, 90)) * MINUTE;
    }
  }

  for (const nap of naps) {
    const napStart = atLocalHour(dayStart, nap.hour) + gauss(rng, 0, jitter, -45, 45) * MINUTE;
    const len = gauss(rng, nap.minutes, 15, 20, 200);
    sleeps.push({ start: napStart, end: napStart + len * MINUTE });
  }

  return sleeps.sort((a, b) => a.start - b.start);
}

const NAP_SCHEDULES = {
  3: [
    { hour: 8.75, minutes: 60 },
    { hour: 12.25, minutes: 90 },
    { hour: 15.75, minutes: 45 },
  ],
  2: [
    { hour: 9.5, minutes: 75 },
    { hour: 13.5, minutes: 90 },
  ],
  1: [{ hour: 12.5, minutes: 120 }],
};

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

/**
 * `kind` picks the shape of a day; `progress` (0..1 across the series) lets a profile evolve, which
 * is how the consolidating and nap-transition profiles work.
 */
function dayFor(kind, dayStart, rng, progress) {
  switch (kind) {
    case 'newborn':
      return unstructuredDay(dayStart, rng, {});

    case 'newborn-older':
      // 8-10 weeks: slightly longer wake windows, still no rhythm.
      return unstructuredDay(dayStart, rng, { wakeMean: 75, sleepMean: 140 });

    case 'consolidating': {
      // The night grows while the naps shrink — the actual mechanics of a rhythm appearing, and the
      // reason the phase-2 test is a ratio against the child's own naps rather than a fixed 5h.
      const nightHours = lerp(2.5, 8, progress);
      const napMinutes = lerp(150, 75, progress);
      return structuredDay(dayStart, rng, {
        nightStart: 20.5,
        nightHours,
        nightWakes: progress < 0.5 ? 2 : 1,
        naps: [
          { hour: 9, minutes: napMinutes },
          { hour: 13, minutes: napMinutes },
          { hour: 16.5, minutes: napMinutes * 0.7 },
        ],
      });
    }

    case 'circadian':
      // A real night, naps still ragged in count and length: phase 2, not yet 3.
      return structuredDay(dayStart, rng, {
        nightStart: 19.75,
        nightHours: 9,
        nightWakes: 1,
        jitter: 45,
        naps:
          rng() < 0.5
            ? [
                { hour: 9, minutes: 50 },
                { hour: 12.5, minutes: 80 },
                { hour: 16, minutes: 40 },
              ]
            : [
                { hour: 10, minutes: 70 },
                { hour: 14, minutes: 60 },
              ],
      });

    case 'naps3':
      return structuredDay(dayStart, rng, {
        nightStart: 19.5,
        nightHours: 11,
        naps: NAP_SCHEDULES[3],
      });

    case 'naps2':
      return structuredDay(dayStart, rng, {
        nightStart: 19.5,
        nightHours: 11.5,
        naps: NAP_SCHEDULES[2],
      });

    case 'naps3to2': {
      // A real transition is messy: mixed days for a couple of weeks, not a clean switch.
      const dropped = rng() < progress;
      return structuredDay(dayStart, rng, {
        nightStart: 19.5,
        nightHours: 11,
        naps: dropped ? NAP_SCHEDULES[2] : NAP_SCHEDULES[3],
      });
    }

    case 'naps2to1': {
      const dropped = rng() < progress;
      return structuredDay(dayStart, rng, {
        nightStart: 19.5,
        nightHours: 11.5,
        naps: dropped ? NAP_SCHEDULES[1] : NAP_SCHEDULES[2],
      });
    }

    default:
      throw new Error(`Unknown fixture profile: ${kind}`);
  }
}

// ---------------------------------------------------------------------------
// Disturbances
// ---------------------------------------------------------------------------

/**
 * Things that wreck sleep for a few days without changing what the child is developmentally
 * capable of. The engine must ride these out without dropping a phase.
 */
function disturbedDayFor(type, dayStart, rng, progress) {
  switch (type) {
    case 'teething':
      // Night in pieces, naps short and useless.
      return structuredDay(dayStart, rng, {
        nightStart: 19.5,
        nightHours: 7.5,
        nightWakes: 3,
        naps: [
          { hour: 9, minutes: 25 },
          { hour: 12.5, minutes: 30 },
          { hour: 15.5, minutes: 20 },
        ],
      });

    case 'travel':
      // Everything shifted by three hours, plus a broken first night.
      return structuredDay(dayStart, rng, {
        nightStart: 22.5,
        nightHours: 8,
        nightWakes: 2,
        jitter: 60,
        naps: [
          { hour: 11, minutes: 45 },
          { hour: 15.5, minutes: 50 },
        ],
      });

    case 'growth-spurt':
      // Waking to feed repeatedly; the night total barely drops but it is in pieces.
      return structuredDay(dayStart, rng, {
        nightStart: 19.5,
        nightHours: 10,
        nightWakes: 4,
        naps: NAP_SCHEDULES[3],
      });

    case 'regression':
      // The durable one: no consolidated night at all, for as long as it lasts.
      return unstructuredDay(dayStart, rng, { wakeMean: 90, sleepMean: 110, sleepSd: 30 });

    default:
      return dayFor('naps3', dayStart, rng, progress);
  }
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * Builds a log ending at `endAt`, covering `days` days.
 *
 * `disturbances`: [{ type, fromDay, toDay }] with day indices counted from the oldest day, so
 * `{ type: 'teething', fromDay: 25, toDay: 30 }` on a 30-day series is "the last five days".
 *
 * Returns events newest-first, the way the API does, so tests exercise the same ordering the app
 * actually receives.
 */
export function generateSleepLog({
  kind,
  days = 21,
  endAt = Date.now(),
  dob = null,
  seed = 1,
  disturbances = [],
  feeds = true,
  omitSleepOnDays = [],
}) {
  const rng = makeRng(seed);
  const firstDay = startOfLocalDay(addLocalDays(endAt, -(days - 1)));
  const events = [];
  let id = 1;

  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const dayStart = startOfLocalDay(addLocalDays(firstDay, dayIndex));
    const progress = days > 1 ? dayIndex / (days - 1) : 1;
    const disturbance = disturbances.find((d) => dayIndex >= d.fromDay && dayIndex < d.toDay);

    let sleeps = disturbance
      ? disturbedDayFor(disturbance.type, dayStart, rng, progress)
      : dayFor(kind, dayStart, rng, progress);

    sleeps = sleeps.filter((s) => s.end <= endAt);

    // "Someone forgot to log this one" — used to test the missing-log detector. Several entries
    // may name the same day, so a scenario can drop more than one sleep from it.
    const omitted = omitSleepOnDays.filter((o) => o.day === dayIndex).map((o) => o.index);
    if (omitted.length) sleeps = sleeps.filter((_, i) => !omitted.includes(i));

    for (const s of sleeps) {
      events.push({
        id: id++,
        type: 'sleep',
        startedAt: new Date(s.start).toISOString(),
        endedAt: new Date(s.end).toISOString(),
        details: {},
      });

      // A feed shortly after each wake, and a nappy change between: this is what the missing-log
      // detector corroborates against, and every real log of this family has them.
      if (feeds && s.end + 10 * MINUTE < endAt) {
        events.push({
          id: id++,
          type: 'breastfeeding',
          startedAt: new Date(s.end + 8 * MINUTE).toISOString(),
          endedAt: new Date(s.end + 28 * MINUTE).toISOString(),
          details: { side: 'left' },
        });
        if (rng() < 0.7 && s.end + 35 * MINUTE < endAt) {
          events.push({
            id: id++,
            type: 'diaper',
            startedAt: new Date(s.end + 33 * MINUTE).toISOString(),
            endedAt: new Date(s.end + 33 * MINUTE).toISOString(),
            details: { wet: true, dirty: false },
          });
        }
      }
    }
  }

  events.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));

  return {
    events,
    child: { name: 'Fixture', dateOfBirth: dob ?? new Date(firstDay - 14 * 86400000).toISOString(), sex: 'female' },
    firstDay,
    endAt,
  };
}

/** Child born `weeks` before `endAt` — the age drives which baseline table row applies. */
export function dobForAgeWeeks(weeks, endAt) {
  return new Date(endAt - weeks * 7 * 86400000).toISOString();
}

/** The real sleep onsets in a generated log, for the calibration backtest. */
export function sleepOnsets(events) {
  return events
    .filter((e) => e.type === 'sleep')
    .map((e) => new Date(e.startedAt).getTime())
    .sort((a, b) => a - b);
}
