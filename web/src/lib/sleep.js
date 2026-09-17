/**
 * Sleep prediction: when is the next sleep likely, and how sure are we?
 *
 * Deliberately imports nothing but its own reference data — no React, no date-fns, no dateUtils.js
 * — so the whole engine runs under plain `node --test` on a fresh clone with no node_modules. All
 * the date handling it needs is ~30 lines at the top, and it is all *local* time (the app stores
 * UTC, but "which day" and "which part of the day" are questions about the parent's wall clock).
 *
 * Shape of the thing, borrowed from how SweetSpot is publicly described rather than from any code:
 * start from an age-appropriate wake window, then let the child's own recent data pull the estimate
 * away from it. Everything else here exists because real logs are messy — forgotten timers,
 * retroactive entries that overlap, naps nobody wrote down.
 *
 * `now` is always an explicit parameter, so every one of these is deterministically testable.
 */

import {
  PROVISIONAL_TUNABLES as T,
  napCutoffHour,
  totalSleepTarget,
  wakeWindowBaseline,
} from './sleepGuidance.js';

const MINUTE = 60000;
const HOUR = 3600000;
const DAY = 86400000;

/** Below this, a logged sleep is a mis-tap or an immediately abandoned timer, not a sleep. */
const MIN_SLEEP_MINUTES = 5;

// ---------------------------------------------------------------------------
// Dates (local time) and small statistics, dependency-free
// ---------------------------------------------------------------------------

function startOfLocalDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Add whole days in *local* time, so a DST boundary stays a day and not 23 or 25 hours. */
function addLocalDays(t, n) {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

function localHour(t) {
  const d = new Date(t);
  return d.getHours() + d.getMinutes() / 60;
}

function localDayKey(t) {
  const d = new Date(t);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + day;
}

export function ageInWeeksAt(dateOfBirth, at) {
  if (!dateOfBirth) return null;
  const weeks = (at - new Date(dateOfBirth).getTime()) / (7 * DAY);
  return weeks < 0 ? 0 : Math.floor(weeks);
}

export function ageInMonthsAt(dateOfBirth, at) {
  if (!dateOfBirth) return null;
  const months = (at - new Date(dateOfBirth).getTime()) / ((365.2425 / 12) * DAY);
  return months < 0 ? 0 : months;
}

function sortedNumbers(values) {
  return [...values].sort((a, b) => a - b);
}

function median(values) {
  if (!values.length) return null;
  const s = sortedNumbers(values);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Nearest-rank percentile: no interpolation, so tiny samples behave predictably. */
function percentile(values, p) {
  if (!values.length) return null;
  const s = sortedNumbers(values);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx];
}

function iqr(values) {
  if (values.length < 2) return 0;
  return percentile(values, 75) - percentile(values, 25);
}

/** Median absolute deviation, scaled to be comparable to a standard deviation. */
function mad(values) {
  const m = median(values);
  if (m == null) return 0;
  return 1.4826 * median(values.map((v) => Math.abs(v - m)));
}

function stdDev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function overlapMs(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

// ---------------------------------------------------------------------------
// 1. Normalising what was actually logged
// ---------------------------------------------------------------------------

/**
 * Turns raw sleep events into clean, non-overlapping intervals.
 *
 * Overlaps are real: the MCP tool can log a sleep retroactively on top of one a timer is already
 * running, and a double-tap can do it too. Left alone they produce negative wake windows (silently
 * swallowed) and sleep totals that double-count — "18h30 slept today" against a 17h target.
 *
 * A sleep still running is kept as `open`. If it has been running implausibly long (someone forgot
 * to press stop at 2am), it is marked `suspect` and excluded from every total and every
 * observation, rather than quietly adding seven phantom hours to the day.
 */
export function normalizeSleeps(events, now = Date.now()) {
  const raw = [];
  for (const e of events) {
    if (e.type !== 'sleep') continue;
    const start = new Date(e.startedAt).getTime();
    if (!Number.isFinite(start)) continue;
    const end = e.endedAt ? new Date(e.endedAt).getTime() : null;
    if (end != null && !(end > start)) continue; // zero or negative duration: unusable
    // A sleep of a couple of minutes is a mis-tap, not a sleep — and left in, it splits a real
    // wake window into two short bogus observations and drags the estimate down with them.
    if (end != null && end - start < MIN_SLEEP_MINUTES * MINUTE) continue;
    raw.push({ id: e.id, start, end, open: end == null });
  }
  raw.sort((a, b) => a.start - b.start);

  const merged = [];
  for (const s of raw) {
    const prev = merged[merged.length - 1];
    const effectiveEnd = s.end ?? Math.max(now, s.start);
    if (prev && s.start <= prev.effectiveEnd) {
      if (prev.open) {
        // A timer still running when a later sleep was logged was never stopped. Since an open
        // interval notionally runs until now, merging here would let it swallow every sleep logged
        // since — and, being marked suspect, take them all out of every total. So clip it at the
        // next sleep and leave it standing on its own as stale.
        prev.effectiveEnd = Math.min(prev.effectiveEnd, s.start);
        prev.stale = true;
      } else {
        prev.effectiveEnd = Math.max(prev.effectiveEnd, effectiveEnd);
        prev.end = s.open ? null : Math.max(prev.end, s.end);
        prev.open = s.open;
        continue;
      }
    }
    merged.push({
      id: s.id,
      start: s.start,
      end: s.end,
      effectiveEnd,
      open: s.open,
      stale: false,
      suspect: false,
    });
  }

  // "Implausibly long" is judged against this child's own recent sleeps, with a floor so a baby
  // with no history yet doesn't get flagged for one normal long night.
  const recentDurations = merged
    .filter((s) => !s.open && s.start >= now - 14 * DAY)
    .map((s) => s.end - s.start);
  const p90 = percentile(recentDurations, 90);
  const suspectThreshold = Math.max(4 * HOUR, p90 != null ? 2 * p90 : 0);
  for (const s of merged) {
    if (s.open && (s.stale || now - s.start > suspectThreshold)) s.suspect = true;
  }

  // The *last* open interval is the one that might really be running; an earlier one can only be
  // a timer left on.
  let openSleep = null;
  for (const s of merged) if (s.open) openSleep = s;
  return { intervals: merged, openSleep, suspectThreshold };
}

/**
 * Minutes of sleep inside [from, to), clipping intervals at the boundaries instead of attributing
 * a whole sleep to the day it started on. A newborn crosses midnight most nights, so start-day
 * attribution is off by hours — and start-day attribution is exactly what the existing
 * "Sleep hours / day" chart does.
 */
export function sleepMinutesInInterval(intervals, from, to) {
  let ms = 0;
  for (const s of intervals) {
    if (s.suspect) continue;
    ms += overlapMs(s.start, s.effectiveEnd, from, to);
  }
  return Math.round(ms / MINUTE);
}

// ---------------------------------------------------------------------------
// 2. Observed wake windows, and spotting the sleeps nobody logged
// ---------------------------------------------------------------------------

/**
 * Above this multiple of the age-appropriate maximum, a wake window gets audited.
 *
 * Set from the shape of the mistake being looked for rather than picked round: a merged window is
 * wake + missed sleep + wake, so at newborn scale roughly 55 + 125 + 55 against a 75-minute age
 * max — near 3x. A genuinely long single window is more like 1.7x. Auditing from 2.2x separates
 * the two; auditing lower drags real evening cluster-feeding stretches into the net, and losing
 * those biases the estimate low exactly during the hardest part of the day.
 */
const MISSING_LOG_RATIO = 2.2;

/** Beyond this with nothing logged, the app has lost track rather than learned something. */
const STALE_HISTORY_MS = 86400000;

/**
 * How long a stretch with nothing logged has to be before it reads as a sleep nobody recorded:
 * longer than this child could plausibly stay awake with no feed and no nappy change. Expressed
 * against her own age baseline rather than as a flat number, with a floor for the youngest weeks.
 */
const DEAD_ZONE_FLOOR_MINUTES = 45;

/**
 * Awake stretches between consecutive sleeps.
 *
 * The hard part is the nap nobody logged: it silently merges two wake windows into one long one.
 * Judging that by length alone is hopeless — a flat "discard anything over 2.5x the age max" both
 * misses about half of them and throws away the real 2-3h evening cluster-feeding stretches. So
 * corroborate with everything else the family logs instead: a genuine two-hour awake stretch
 * contains feeds and nappy changes, while a merged one contains a dead zone with no events of any
 * kind, which is where the unlogged sleep was.
 *
 * Worth being honest about what this buys, since it is narrower than it looks: the rolling median
 * downstream already shrugs off one merged window, so excluding them barely moves the estimate
 * itself. What it protects is the *band* (a merged window inflates the spread the band is derived
 * from) and the honesty banner on the card. It also matters much more in the first days, when three
 * observations is the whole dataset and a median of three is not robust to anything.
 */
export function observedWakeWindows(intervals, events, ageWeeks, now = Date.now()) {
  const baseline = wakeWindowBaseline(ageWeeks ?? 0);
  const auditAbove = MISSING_LOG_RATIO * baseline.max;
  const deadZone = Math.max(DEAD_ZONE_FLOOR_MINUTES, baseline.max) * MINUTE;

  const eventTimes = events
    .map((e) => new Date(e.startedAt).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);

  const windows = [];
  for (let i = 0; i < intervals.length - 1; i += 1) {
    const a = intervals[i];
    const b = intervals[i + 1];
    if (a.open || a.suspect || b.suspect) continue;
    const wokeAt = a.end;
    const sleptAt = b.start;
    const minutes = (sleptAt - wokeAt) / MINUTE;
    if (minutes < 5) continue; // two taps for what was really one sleep

    const flags = [];
    if (minutes > auditAbove) {
      const interior = eventTimes.filter((t) => t > wokeAt && t < sleptAt);
      if (interior.length === 0) {
        // Nothing at all logged across a long stretch: no feed, no nappy, nothing. Either a sleep
        // went unrecorded or the whole stretch did; either way it is not evidence.
        flags.push('no-corroboration');
      } else {
        const points = [wokeAt, ...interior, sleptAt];
        let gap = 0;
        for (let k = 0; k < points.length - 1; k += 1) {
          gap = Math.max(gap, points[k + 1] - points[k]);
        }
        if (gap >= deadZone) flags.push('probable-unlogged-sleep');
      }
    }

    windows.push({
      wokeAt,
      sleptAt,
      minutes,
      value: minutes,
      slot: slotOf(wokeAt),
      precededBy: (a.end - a.start) / MINUTE,
      excluded: flags.length > 0,
      flags,
    });
  }

  // Winsorise rather than discard: a genuinely long-but-real window should nudge the estimate and
  // widen the band, not vanish and leave the card overconfident.
  const kept = windows.filter((w) => !w.excluded);
  if (kept.length >= 5) {
    const cap = percentile(
      kept.map((w) => w.minutes),
      90
    );
    for (const w of kept) w.value = Math.min(w.minutes, cap);
  }
  return windows;
}

/** Time-of-day buckets, used only once a circadian rhythm exists (phase 2+). */
export function slotOf(t) {
  const h = localHour(t);
  if (h >= 5 && h < 10) return 'morning';
  if (h >= 10 && h < 14) return 'midday';
  if (h >= 14 && h < 18) return 'afternoon';
  if (h >= 18 && h < 21) return 'evening';
  return 'night';
}

/** Fraction of recent windows that smell of a missing log — surfaced to the parent, not hidden. */
export function dataQuality(windows, sinceDays = 3, now = Date.now()) {
  const recent = windows.filter((w) => w.wokeAt >= now - sinceDays * DAY);
  const suspect = recent.filter((w) => w.excluded).length;
  return {
    windows: recent.length,
    suspect,
    ratio: recent.length ? suspect / recent.length : 0,
    lowQuality: recent.length >= 4 && suspect / recent.length > 0.25,
  };
}

// ---------------------------------------------------------------------------
// 3. The estimator
// ---------------------------------------------------------------------------

/**
 * Clean observations at which the child's own data fully replaces the population prior.
 *
 * A weight of n/(n+k) never quite lets go: at ten observations all saying 100 minutes it still
 * reports 87, which is barely different from the hard clamp it was meant to replace. Linear to 1
 * means ten observations — about a day and a half of a newborn, a week of a toddler — and the app
 * says what it has actually seen.
 */
const SHRINKAGE_FULL_AT = 10;

function shrinkWeight(n) {
  return Math.min(1, n / SHRINKAGE_FULL_AT);
}

/**
 * Estimated wake window, as a point and a half-width.
 *
 * A rolling median, not an EWMA. A newborn's wake window grows perhaps 3 minutes a week against a
 * noise standard deviation around 20, so a weighted average buys a rounding error of trend
 * responsiveness in exchange for collapsing completely on a single contaminated observation. The
 * median of seven tolerates three bad points; EWMA(0.5) tolerates none. (Worth revisiting around
 * 4-6 months, when the trend finally outgrows the noise.)
 *
 * The age table is a prior, not a cap. With ten observations all saying 100 minutes this returns
 * 100 — not 86 because a reference table says so.
 */
export function estimateWakeWindow(windows, baseline, { disturbed = false, now = Date.now() } = {}) {
  const kept = windows.filter((w) => !w.excluded);
  let recent = kept.filter((w) => w.wokeAt >= now - 7 * DAY);
  if (recent.length < 5) recent = kept.filter((w) => w.wokeAt >= now - 14 * DAY);
  recent = recent.slice(-12);

  const values = recent.map((w) => w.value);
  // The band comes from the spread *before* outlier rejection: rejection shrinks the IQR, which
  // would shrink the band, leaving the card most confident exactly when the data is worst.
  const spread = iqr(values);

  let clean = values;
  if (values.length >= 4 && spread > 0) {
    const m = median(values);
    clean = values.filter((v) => Math.abs(v - m) <= 1.5 * spread);
  }

  const n = clean.length;
  let weight = shrinkWeight(n);
  if (disturbed) weight *= 0.5; // lean back on the population while things are unsettled

  const own = median(clean);
  const point = own == null ? baseline.mid : weight * own + (1 - weight) * baseline.mid;

  let half = n >= 3 ? clamp(0.95 * spread, 20, 60) : Math.max(20, (baseline.max - baseline.min) / 2);
  if (disturbed) half *= T.disturbedBandMultiplier;

  return {
    point,
    half,
    samples: n,
    source: n >= 3 ? 'personal' : 'age-table',
    observations: recent,
  };
}

/**
 * Phase 2+ only: nudge the pooled estimate towards the slot the child is actually in, but only if
 * the slots genuinely differ. Partitioning the data five ways when there is no time-of-day effect
 * just multiplies the standard error of our own estimate, so shrink rather than split.
 */
function slotAdjusted(estimate, slot) {
  const bySlot = new Map();
  for (const w of estimate.observations) {
    if (!bySlot.has(w.slot)) bySlot.set(w.slot, []);
    bySlot.get(w.slot).push(w.value);
  }
  const groups = [...bySlot.values()].filter((g) => g.length >= 2);
  if (groups.length < 2) return estimate;

  const between = stdDev(groups.map((g) => median(g))) ** 2;
  const within = groups.reduce((acc, g) => acc + stdDev(g) ** 2, 0) / groups.length;
  if (!(between > T.slotVarianceRatioRequired * within)) return estimate;

  const own = bySlot.get(slot) ?? [];
  if (own.length === 0) return estimate;
  const w = shrinkWeight(own.length);
  return { ...estimate, point: w * median(own) + (1 - w) * estimate.point, slotApplied: slot };
}

// ---------------------------------------------------------------------------
// 4. The phase engine
// ---------------------------------------------------------------------------

/**
 * One row per local day: how that day's sleep was shaped.
 *
 * Sleeps are attributed to a day by their start shifted back 7 hours, so a night that starts at
 * 23:10 and the 02:40 stretch that follows it belong to the same night rather than to two days.
 */
export function dailySummaries(intervals, now = Date.now(), days = 22) {
  const byDay = new Map();
  const firstDay = startOfLocalDay(addLocalDays(now, -(days - 1)));
  for (let i = 0; i < days; i += 1) {
    const dayStart = startOfLocalDay(addLocalDays(firstDay, i));
    byDay.set(localDayKey(dayStart), { dayStart, key: localDayKey(dayStart), sleeps: [] });
  }

  for (const s of intervals) {
    if (s.suspect) continue;
    const row = byDay.get(localDayKey(s.start - 7 * HOUR));
    if (!row) continue;
    const duration = (s.effectiveEnd - s.start) / MINUTE;
    const midHour = localHour((s.start + s.effectiveEnd) / 2);
    row.sleeps.push({ duration, nocturnal: midHour >= 19 || midHour < 7, start: s.start });
  }

  return [...byDay.values()].map((row) => {
    const nocturnal = row.sleeps.filter((s) => s.nocturnal).map((s) => s.duration);
    const naps = row.sleeps.filter((s) => !s.nocturnal).map((s) => s.duration);
    return {
      ...row,
      hasData: row.sleeps.length > 0,
      nocturnalLongest: nocturnal.length ? Math.max(...nocturnal) : 0,
      otherMedian: median(naps) ?? 0,
      napCount: naps.length,
      totalMinutes: row.sleeps.reduce((acc, s) => acc + s.duration, 0),
    };
  });
}

/**
 * Has the night consolidated? Stated as a ratio against this child's own other sleeps rather than
 * an absolute number of hours, so there is nothing to calibrate for a baby who sleeps long or short.
 */
function nightConsolidated(day) {
  if (!day.hasData) return false;
  if (day.nocturnalLongest < T.nightConsolidationFloorMinutes) return false;
  if (day.otherMedian === 0) return true; // everything is in one nocturnal block
  return day.nocturnalLongest >= T.nightConsolidationRatio * day.otherMedian;
}

function napRegimeStable(window) {
  const withData = window.filter((d) => d.hasData);
  if (withData.length < T.napRegimeDaysRequired) return false;
  const counts = withData.map((d) => d.napCount);
  if ((median(counts) ?? 0) < 1) return false;
  return stdDev(counts) <= T.napRegimeMaxStdDev;
}

/**
 * Spread of a baseline, in the units the z-score needs, with a floor.
 *
 * A metronomic child has a median absolute deviation of nearly zero, and dividing by it puts both
 * tails wrong: exactly zero and no disturbance can EVER be detected (a child whose nights collapse
 * from eleven hours to two would be waved through), while merely tiny and every ordinary wobble
 * reads as a crisis. Flooring the scale at 5% of the baseline itself fixes both without blunting
 * detection for a normally variable child, whose real spread is far above the floor.
 */
function baselineScale(values) {
  const spread = mad(values);
  const floor = 0.05 * Math.abs(median(values) ?? 0);
  return Math.max(spread, floor);
}

/**
 * Is sleep disturbed right now? Teething, travel, a growth spurt, illness — every one of them looks
 * exactly like losing a phase, which is why this exists: while it is true the phase is frozen and
 * the demotion counter is suspended.
 *
 * A robust z-score in MAD units against the child's own recent baseline, so again nothing absolute.
 */
function disturbanceAt(windows, summaries, at) {
  const recentFrom = at - T.ruptureRecentDays * DAY;
  const baseFrom = at - (T.ruptureRecentDays + T.ruptureBaselineDays) * DAY;

  const recentW = windows.filter((w) => !w.excluded && w.wokeAt > recentFrom && w.wokeAt <= at);
  const baseW = windows.filter((w) => !w.excluded && w.wokeAt > baseFrom && w.wokeAt <= recentFrom);
  if (recentW.length >= 4 && baseW.length >= 6) {
    const baseValues = baseW.map((w) => w.value);
    const scale = baselineScale(baseValues);
    if (scale > 0) {
      const z = Math.abs(median(recentW.map((w) => w.value)) - median(baseValues)) / scale;
      if (z > T.ruptureMadThreshold) return { disturbed: true, reason: 'wake-windows', z };
    }
  }

  // A night falling apart is the other face of the same thing, and it shows up in the nights before
  // it shows up in the wake windows.
  const days = summaries.filter((d) => d.hasData && d.dayStart <= at);
  const recentD = days.slice(-T.ruptureRecentDays).map((d) => d.nocturnalLongest);
  const baseD = days
    .slice(-(T.ruptureRecentDays + T.ruptureBaselineDays), -T.ruptureRecentDays)
    .map((d) => d.nocturnalLongest);
  if (recentD.length >= 2 && baseD.length >= 5) {
    const scale = baselineScale(baseD);
    const baseMedian = median(baseD);
    if (scale > 0 && median(recentD) < baseMedian) {
      const z = Math.abs(median(recentD) - baseMedian) / scale;
      if (z > T.ruptureMadThreshold) return { disturbed: true, reason: 'nights', z };
    }
  }

  return { disturbed: false, reason: null, z: 0 };
}

/**
 * Which phase is this child in, replayed forward over the loaded history.
 *
 *   1. Unstructured — no day/night rhythm at all. Sleeps around the clock, every 2-3 hours.
 *   2. Circadian — a real night has appeared.
 *   3. Nap regime — the number of naps has settled, and transitions between regimes matter.
 *
 * Nothing is stored: this is a pure function of the events, replayed every time. That keeps it
 * migration-free, keeps it testable, and means there is no learned state anywhere that could ever
 * leak between households.
 *
 * The state machine is asymmetric on purpose. A phase is earned on 5 of 7 days but only lost after
 * 13 failing days out of 14, and a disturbed day cannot contribute to losing one — so five bad
 * nights of teething can never drop a six-month-old back to being treated like a newborn.
 *
 * A disturbed day CAN still contribute to gaining a phase, though, which is less obvious. The
 * freeze exists to protect against transient degradation; applying it to promotion too would mean
 * a night that consolidates abruptly (rather than gradually) reads as a shock and holds the child
 * in the previous phase until the good days become the baseline. Promotion already needs 5 days of
 * 7, and being told about a rhythm slightly early is a far cheaper mistake than being dropped back
 * to newborn handling mid-teething.
 *
 * One consequence of replaying rather than storing, worth knowing when reading the rules above: the
 * loaded history is the whole memory. Past roughly two and a half weeks of unbroken regression the
 * good days fall out of the window entirely, so the phase is not so much demoted as never earned in
 * the first place, and the answer arrives sooner than "13 failing days out of 14" implies. In
 * practice the two agree on what matters — a week of bad nights costs nothing, a fortnight and a
 * half of them means the child genuinely has no rhythm right now — but the second number is the
 * window, not the rule.
 */
export function detectPhase(intervals, windows, child, now = Date.now()) {
  const summaries = dailySummaries(intervals, now);
  // Days with nothing logged are skipped entirely rather than counted as failures, and the trailing
  // window is seven days *with data*, not seven calendar days. Counting calendar days instead would
  // mean a family who logs four days a week could never reach five consolidated days out of seven,
  // and would sit in phase 1 for ever however settled their child actually is.
  const evaluable = summaries.filter((d) => d.hasData);

  let phase = 1;
  let failWindow = [];
  let lastChangeAt = null;

  for (let i = 0; i < evaluable.length; i += 1) {
    const day = evaluable[i];
    const at = Math.min(now, day.dayStart + DAY);
    const dayDisturbed = disturbanceAt(windows, summaries, at).disturbed;

    const ageWeeks = ageInWeeksAt(child?.dateOfBirth, day.dayStart) ?? 999;
    const window7 = evaluable.slice(Math.max(0, i - 6), i + 1);
    const consolidatedDays = window7.filter(nightConsolidated).length;

    let target = 1;
    if (consolidatedDays >= T.nightConsolidationDaysRequired && ageWeeks >= T.phase2MinAgeWeeks) {
      target = 2;
      if (napRegimeStable(window7) && ageWeeks >= T.phase3MinAgeWeeks) target = 3;
    }

    if (target > phase) {
      phase = target;
      failWindow = [];
      lastChangeAt = day.dayStart;
    } else if (!dayDisturbed) {
      // Disturbed days are suspended entirely from the demotion count, rather than counted as
      // passing — a month of alternating good and bad days should still eventually step down.
      failWindow.push(target < phase);
      if (failWindow.length > T.demotionWindowDays) failWindow.shift();
      if (failWindow.filter(Boolean).length >= T.demotionFailingDaysRequired) {
        phase = Math.max(1, phase - 1);
        failWindow = [];
        lastChangeAt = day.dayStart;
      }
    }
  }

  const disturbance = disturbanceAt(windows, summaries, now);
  const napCounts = evaluable.slice(-7).map((d) => d.napCount);

  return {
    phase,
    disturbed: disturbance.disturbed,
    disturbanceReason: disturbance.reason,
    lastChangeAt,
    daysOfData: evaluable.length,
    napRegime:
      phase >= 3 && napCounts.length
        ? {
            naps: Math.round(median(napCounts)),
            transitioning: stdDev(napCounts) > T.napRegimeMaxStdDev,
          }
        : null,
    nightWindow: phase >= 2 ? deriveNightWindow(intervals, now) : null,
  };
}

/**
 * Where this child's night actually sits, measured rather than assumed: the 8-hour slice of the
 * clock holding the most sleep over the last fortnight. A hardcoded 19:00-07:00 would be wrong for
 * any family whose evenings don't look like the textbook.
 */
export function deriveNightWindow(intervals, now = Date.now(), lengthHours = 8) {
  const minutesByHour = new Array(24).fill(0);
  const from = now - 14 * DAY;
  for (const s of intervals) {
    if (s.suspect) continue;
    for (let t = Math.max(s.start, from); t < s.effectiveEnd; t += 30 * MINUTE) {
      minutesByHour[new Date(t).getHours()] += 30;
    }
  }
  let best = { startHour: 19, total: -1 };
  for (let h = 0; h < 24; h += 1) {
    let total = 0;
    for (let k = 0; k < lengthHours; k += 1) total += minutesByHour[(h + k) % 24];
    if (total > best.total) best = { startHour: h, total };
  }
  return { startHour: best.startHour, endHour: (best.startHour + lengthHours) % 24 };
}

function isNightAt(t, nightWindow) {
  if (!nightWindow) return false;
  const h = localHour(t);
  const { startHour, endHour } = nightWindow;
  return startHour < endHour ? h >= startHour && h < endHour : h >= startHour || h < endHour;
}

// ---------------------------------------------------------------------------
// 5. The prediction
// ---------------------------------------------------------------------------

/**
 * What to show the parent right now.
 *
 * Four states, because reality has four: awake (here is the window), asleep (here is when she will
 * probably wake — that is half of a newborn's day, and a design that only predicts sleep onsets
 * shows nothing for it), overdue (past the usual window; never render a negative countdown), and
 * unknown.
 */
export function predictNextSleep(events, child, now = Date.now()) {
  const { intervals, openSleep } = normalizeSleeps(events, now);
  const ageWeeks = ageInWeeksAt(child?.dateOfBirth, now);
  const baseline = wakeWindowBaseline(ageWeeks ?? 0);
  const windows = observedWakeWindows(intervals, events, ageWeeks, now);
  const phaseInfo = detectPhase(intervals, windows, child, now);
  const quality = dataQuality(windows, 3, now);

  const base = {
    phase: phaseInfo.phase,
    disturbed: phaseInfo.disturbed,
    disturbanceReason: phaseInfo.disturbanceReason,
    napRegime: phaseInfo.napRegime,
    nightWindow: phaseInfo.nightWindow,
    dataQuality: quality,
    ageWeeks,
    baseline,
  };

  const closed = intervals.filter((s) => !s.open && !s.suspect);
  const lastClosed = closed[closed.length - 1] ?? null;

  if (openSleep && openSleep.suspect) {
    return {
      ...base,
      state: 'unknown',
      kind: null,
      from: null,
      to: null,
      point: null,
      confidence: 'low',
      lastWakeAt: lastClosed?.end ?? null,
      asleepSince: openSleep.start,
      suspectRunningSleep: true,
      basis: { source: 'age-table', samples: 0, flags: ['suspect-running-sleep'] },
    };
  }

  // Asleep: the useful question is when she will wake, answered from her own recent sleep lengths.
  if (openSleep) {
    const sameKind = (s) =>
      phaseInfo.phase < 2 ||
      isNightAt(s.start, phaseInfo.nightWindow) === isNightAt(openSleep.start, phaseInfo.nightWindow);
    const durations = closed
      .filter((s) => s.start >= now - 14 * DAY && sameKind(s))
      .map((s) => (s.end - s.start) / MINUTE);
    const typical = median(durations) ?? baseline.mid * 2;
    const half = durations.length >= 3 ? clamp(0.95 * iqr(durations), 20, 90) : 45;
    const elapsed = (now - openSleep.start) / MINUTE;
    // Both edges are floored at "now": she is demonstrably still asleep, so a window that has
    // already passed would otherwise render backwards ("wakes around 14:00-11:40").
    const pastTypical = elapsed > typical + half;
    return {
      ...base,
      state: 'asleep',
      kind:
        phaseInfo.phase >= 2 && isNightAt(openSleep.start, phaseInfo.nightWindow) ? 'night' : 'sleep',
      from: openSleep.start + Math.max(typical - half, elapsed) * MINUTE,
      to: openSleep.start + Math.max(typical + half, elapsed + 10) * MINUTE,
      pastTypical,
      point: openSleep.start + typical * MINUTE,
      minutes: typical,
      confidence: confidenceOf(durations.length, phaseInfo.disturbed),
      lastWakeAt: lastClosed?.end ?? null,
      asleepSince: openSleep.start,
      basis: {
        source: durations.length >= 3 ? 'personal' : 'age-table',
        samples: durations.length,
        flags: flagsOf(phaseInfo, quality),
      },
    };
  }

  if (!lastClosed) {
    return {
      ...base,
      state: 'unknown',
      kind: null,
      from: null,
      to: null,
      point: null,
      confidence: 'low',
      lastWakeAt: null,
      asleepSince: null,
      basis: { source: 'age-table', samples: 0, flags: flagsOf(phaseInfo, quality) },
    };
  }

  const lastWakeAt = lastClosed.end;

  // Nothing logged for a day or more means logging stopped, not that she has been awake since.
  // A clock-only "expected around 09:20" from three days ago is indistinguishable from one from
  // this morning, so say nothing instead.
  if (now - lastWakeAt > STALE_HISTORY_MS) {
    return {
      ...base,
      state: 'unknown',
      kind: null,
      from: null,
      to: null,
      point: null,
      confidence: 'low',
      lastWakeAt,
      asleepSince: null,
      staleHistory: true,
      basis: { source: 'age-table', samples: 0, flags: [...flagsOf(phaseInfo, quality), 'stale-history'] },
    };
  }

  let estimate = estimateWakeWindow(windows, baseline, { disturbed: phaseInfo.disturbed, now });
  if (phaseInfo.phase >= 2) estimate = slotAdjusted(estimate, slotOf(lastWakeAt));

  let minutes = estimate.point;
  const adjustments = [];

  if (phaseInfo.phase >= 2) {
    const lastSleepMinutes = (lastClosed.end - lastClosed.start) / MINUTE;
    const wasNight = isNightAt(lastClosed.start, phaseInfo.nightWindow);
    if (!wasNight && lastSleepMinutes < T.shortNapMinutes) {
      minutes *= T.shortNapPenalty; // an incomplete sleep cycle doesn't buy a full wake window
      adjustments.push('short-nap');
    }
  }

  if (phaseInfo.phase >= 3) {
    // Discrete, not a continuous term: a smooth sleep-debt formula saturates in nearly every real
    // scenario, which makes it a switch wearing a formula. So it is written as a switch.
    const dayStart = startOfLocalDay(now);
    const sleptToday = sleepMinutesInInterval(intervals, dayStart, now);
    const target = totalSleepTarget(ageInMonthsAt(child?.dateOfBirth, now) ?? 6);
    const expected = target.mid * ((now - dayStart) / DAY);
    if (sleptToday < expected - 90) {
      minutes *= 0.9;
      adjustments.push('sleep-debt');
    } else if (sleptToday > expected + 90) {
      minutes *= 1.1;
      adjustments.push('sleep-surplus');
    }
  }

  const point = lastWakeAt + minutes * MINUTE;
  const half = estimate.half * MINUTE;
  let kind = 'sleep';
  if (phaseInfo.phase >= 2) {
    kind = isNightAt(point, phaseInfo.nightWindow) ? 'night' : 'nap';
    if (kind === 'nap' && localHour(point) > napCutoffHour(ageWeeks ?? 0)) kind = 'night';
  }

  return {
    ...base,
    state: now > point + half ? 'overdue' : 'awake',
    kind,
    from: point - half,
    to: point + half,
    point,
    minutes,
    confidence: confidenceOf(estimate.samples, phaseInfo.disturbed),
    lastWakeAt,
    asleepSince: null,
    basis: {
      source: estimate.source,
      samples: estimate.samples,
      slot: estimate.slotApplied ?? null,
      adjustments,
      flags: flagsOf(phaseInfo, quality),
    },
  };
}

function confidenceOf(samples, disturbed) {
  if (disturbed || samples < 3) return 'low';
  return samples >= 8 ? 'high' : 'medium';
}

function flagsOf(phaseInfo, quality) {
  const flags = [];
  if (phaseInfo.disturbed) flags.push('disturbed');
  if (phaseInfo.napRegime?.transitioning) flags.push('nap-transition');
  if (quality.lowQuality) flags.push('missing-logs');
  return flags;
}

// ---------------------------------------------------------------------------
// 6. Stats for the Charts page
// ---------------------------------------------------------------------------

/**
 * Rolling-24h totals as the headline rather than calendar days: until there is a night, "today" is
 * not a unit the child's sleep knows anything about. Per-day totals are still produced for the
 * chart, but clipped at local midnight so they add up to what actually happened on that day.
 */
export function sleepStats(events, child, now = Date.now(), days = 7) {
  const { intervals } = normalizeSleeps(events, now);
  const rolling24 = sleepMinutesInInterval(intervals, now - DAY, now);
  const target = totalSleepTarget(ageInMonthsAt(child?.dateOfBirth, now) ?? 6);

  const inLast24 = intervals.filter((s) => !s.suspect && s.effectiveEnd > now - DAY);
  const longest = inLast24.reduce(
    (acc, s) => Math.max(acc, overlapMs(s.start, s.effectiveEnd, now - DAY, now) / MINUTE),
    0
  );

  const perDay = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const dayStart = startOfLocalDay(addLocalDays(now, -i));
    const dayEnd = startOfLocalDay(addLocalDays(now, -i + 1));
    perDay.push({
      dayStart,
      key: localDayKey(dayStart),
      minutes: sleepMinutesInInterval(intervals, dayStart, Math.min(dayEnd, now)),
      partial: dayEnd > now,
    });
  }

  return {
    rolling24,
    target,
    sleepCount24: inLast24.length,
    longestStretch24: Math.round(longest),
    perDay,
  };
}
