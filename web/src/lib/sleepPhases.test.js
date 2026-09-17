/**
 * The phase state machine and the data pathologies, pinned down case by case.
 *
 * These use hand-built days rather than the generated profiles, because the questions here are
 * structural — "exactly four consolidated days out of seven" — and a realistic log cannot hit an
 * exact count on purpose. The generated profiles cover the realistic side in sleep.test.js.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  estimateWakeWindow,
  normalizeSleeps,
  predictNextSleep,
  sleepMinutesInInterval,
  sleepStats,
} from './sleep.js';
import { wakeWindowBaseline } from './sleepGuidance.js';
import { dobForAgeWeeks, generateSleepLog } from './sleepFixtures.js';

const MINUTE = 60000;
const HOUR = 3600000;
const DAY = 86400000;

const NOW = new Date(2026, 5, 15, 14, 30, 0).getTime();

function sleep(start, end) {
  return {
    type: 'sleep',
    startedAt: new Date(start).toISOString(),
    endedAt: end == null ? null : new Date(end).toISOString(),
    details: {},
  };
}

/** A local wall-clock time on the day `daysAgo` before NOW. */
function at(daysAgo, hour, minute = 0, from = NOW) {
  const d = new Date(from);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

/**
 * One day, either with a consolidated night and two naps, or with sleep spread evenly around the
 * clock the way a newborn's is. Deliberately noiseless so the day counts are exact.
 */
function day(daysAgo, consolidated, from = NOW) {
  if (!consolidated) {
    const out = [];
    for (let h = 0; h < 24; h += 3) out.push(sleep(at(daysAgo, h, 0, from), at(daysAgo, h, 0, from) + 2 * HOUR));
    return out;
  }
  return [
    sleep(at(daysAgo, 19, 30, from), at(daysAgo, 19, 30, from) + 11 * HOUR),
    sleep(at(daysAgo, 9, 0, from), at(daysAgo, 9, 0, from) + 80 * MINUTE),
    sleep(at(daysAgo, 14, 0, from), at(daysAgo, 14, 0, from) + 70 * MINUTE),
  ];
}

function phaseOf(events, ageWeeks = 20, now = NOW) {
  return predictNextSleep(events, { dateOfBirth: dobForAgeWeeks(ageWeeks, now) }, now).phase;
}

describe('promotion', () => {
  it('needs five consolidated days out of the last seven, and four is not enough', () => {
    const build = (consolidatedDays) => {
      const events = [];
      for (let d = 13; d >= 7; d -= 1) events.push(...day(d, false));
      for (let d = 6; d >= 0; d -= 1) events.push(...day(d, d < consolidatedDays));
      return events;
    };
    assert.equal(phaseOf(build(4)), 1, 'four days should not be enough to call it a rhythm');
    assert.equal(phaseOf(build(5)), 2, 'five days should be');
  });

  it('can go straight to a nap regime for a child who arrives already settled', () => {
    // Nothing in the machine forces a stop at phase 2; a six-month-old whose parents start logging
    // today should be recognised for what she is.
    const { events, child } = generateSleepLog({
      kind: 'naps3',
      days: 10,
      seed: 5,
      endAt: NOW,
      dob: dobForAgeWeeks(26, NOW),
    });
    assert.equal(predictNextSleep(events, child, NOW).phase, 3);
  });

  it('still promotes when the night consolidates abruptly rather than gradually', () => {
    // An abrupt improvement trips the disturbance detector, which freezes demotion. It must not
    // freeze promotion too, or good news waits a fortnight for the baseline to catch up.
    const events = [];
    for (let d = 13; d >= 6; d -= 1) events.push(...day(d, false));
    for (let d = 5; d >= 0; d -= 1) events.push(...day(d, true));
    // At or above phase 2: with six clean days the nap count is settled too, so landing on 3 is
    // correct as well. What matters is that it moved at all.
    assert.ok(phaseOf(events) >= 2, 'an abrupt improvement must not be held back as a shock');
  });

  it('is not awarded on age alone', () => {
    // A one-year-old with no rhythm in her logs is phase 1, whatever the reference tables say.
    const events = [];
    for (let d = 13; d >= 0; d -= 1) events.push(...day(d, false));
    assert.equal(phaseOf(events, 52), 1);
  });
});

describe('demotion', () => {
  const settled = () => {
    const events = [];
    for (let d = 44; d >= 30; d -= 1) events.push(...day(d, true));
    return events;
  };

  it('does not happen after a week of bad nights', () => {
    const events = settled();
    for (let d = 29; d >= 23; d -= 1) events.push(...day(d, true));
    for (let d = 22; d >= 16; d -= 1) events.push(...day(d, false));
    for (let d = 15; d >= 0; d -= 1) events.push(...day(d, true));
    assert.ok(phaseOf(events) >= 2, 'one bad week must not cost the phase');
  });

  it('holds on for two and a half weeks, then stops claiming a rhythm', () => {
    // The honest boundary, measured rather than assumed. Because the phase is replayed from the
    // loaded history rather than stored, the 22-day window is the whole memory: beyond about 17
    // days of unbroken regression the good days have fallen out of it, so the phase is never
    // re-earned. That arrives sooner than "13 failing days out of 14" suggests, and it is the
    // number that actually governs.
    const withBadDays = (bad) => {
      const events = [];
      for (let d = 44; d >= bad; d -= 1) events.push(...day(d, true));
      for (let d = bad - 1; d >= 0; d -= 1) events.push(...day(d, false));
      return events;
    };
    assert.equal(phaseOf(withBadDays(7), 30), 3, 'a week of bad nights must cost nothing');
    assert.equal(phaseOf(withBadDays(14), 30), 3, 'nor a fortnight');
    assert.ok(phaseOf(withBadDays(20), 30) < 3, 'three weeks of it is no longer a rhythm');
  });

  it('is not blocked by a family who does not log every single day', () => {
    // The trailing window is seven days WITH DATA, not seven calendar days. Counted by calendar,
    // logging four days a week could never reach five consolidated days out of seven, and a
    // perfectly settled child would sit in phase 1 for ever.
    const everyOtherDay = [];
    for (let d = 21; d >= 0; d -= 1) if (d % 2 === 0) everyOtherDay.push(...day(d, true));
    assert.equal(phaseOf(everyOtherDay, 30), 3);
  });

  it('advances through an intermittent disturbance instead of freezing forever', () => {
    // If a disturbance every other day suspended the counter indefinitely, a real regression that
    // happened to be spiky would be masked permanently.
    const days = 45;
    const disturbances = [];
    for (let d = 17; d < days; d += 2) disturbances.push({ type: 'regression', fromDay: d, toDay: d + 1 });
    const { events, child } = generateSleepLog({
      kind: 'naps3',
      days,
      seed: 7,
      endAt: NOW,
      dob: dobForAgeWeeks(26, NOW),
      disturbances,
    });
    assert.ok(predictNextSleep(events, child, NOW).phase < 3);
  });
});

describe('disturbance detection', () => {
  it('fires even for a child so regular that her variation is zero', () => {
    // A median absolute deviation of zero used to make the z-score undefined, so the check was
    // skipped and a child whose nights collapsed from eleven hours to two sailed through.
    const events = [];
    for (let d = 20; d >= 3; d -= 1) events.push(...day(d, true));
    for (let d = 2; d >= 0; d -= 1) {
      events.push(sleep(at(d, 19, 0), at(d, 19, 0) + 2 * HOUR));
    }
    const prediction = predictNextSleep(events, { dateOfBirth: dobForAgeWeeks(30, NOW) }, NOW);
    assert.equal(prediction.disturbed, true);
    assert.equal(prediction.phase, 3, 'and the phase is held while it is disturbed');
  });

  it('stays quiet for a settled child with nothing unusual going on', () => {
    const { events, child } = generateSleepLog({
      kind: 'naps3',
      days: 21,
      seed: 84,
      endAt: NOW,
      dob: dobForAgeWeeks(26, NOW),
    });
    assert.equal(predictNextSleep(events, child, NOW).disturbed, false);
  });
});

describe('data pathologies', () => {
  it('ignores a mis-tap that logged a one-minute sleep', () => {
    // Left in, it splits a real wake window into two short bogus observations and drags the
    // estimate down with them.
    const tail = [sleep(NOW - 6 * HOUR, NOW - 5 * HOUR), sleep(NOW - 90 * MINUTE, NOW - 30 * MINUTE)];
    const { events } = generateSleepLog({
      kind: 'newborn',
      days: 14,
      seed: 11,
      endAt: NOW - 7 * HOUR,
      dob: dobForAgeWeeks(6, NOW),
    });
    const child = { dateOfBirth: dobForAgeWeeks(6, NOW) };
    const clean = predictNextSleep([...events, ...tail], child, NOW);
    const tapped = predictNextSleep(
      [...events, ...tail, sleep(NOW - 4 * HOUR, NOW - 4 * HOUR + MINUTE)],
      child,
      NOW
    );
    assert.equal(tapped.minutes, clean.minutes);
  });

  it('handles three overlapping sleeps and more than one stray open timer', () => {
    const events = [
      sleep(NOW - 8 * HOUR, NOW - 6 * HOUR),
      sleep(NOW - 7 * HOUR, NOW - 5 * HOUR),
      sleep(NOW - 6 * HOUR, NOW - 4 * HOUR),
      sleep(NOW - 3 * HOUR, null),
      sleep(NOW - 90 * MINUTE, null),
    ];
    const { intervals, openSleep } = normalizeSleeps(events, NOW);
    // The three overlapping ones are one four-hour block, not twelve hours of sleep.
    assert.equal(sleepMinutesInInterval(intervals, NOW - 9 * HOUR, NOW - 3 * HOUR), 240);
    // The later open timer is the one that might really be running.
    assert.equal(openSleep.start, NOW - 90 * MINUTE);
  });

  it('drops unparseable dates without taking the rest of the log with them', () => {
    const events = [
      { type: 'sleep', startedAt: 'not-a-date', endedAt: 'also-bad', details: {} },
      { type: 'sleep', startedAt: new Date(NOW - 2 * HOUR).toISOString(), endedAt: 'nonsense', details: {} },
      sleep(NOW - 5 * HOUR, NOW - 4 * HOUR),
    ];
    const { intervals } = normalizeSleeps(events, NOW);
    assert.equal(intervals.length, 1);
    assert.ok(predictNextSleep(events, { dateOfBirth: dobForAgeWeeks(6, NOW) }, NOW).state);
  });

  it('does not fall over for a child whose date of birth is in the future', () => {
    const prediction = predictNextSleep(
      [sleep(NOW - 5 * HOUR, NOW - 4 * HOUR)],
      { dateOfBirth: new Date(NOW + 60 * DAY).toISOString() },
      NOW
    );
    assert.equal(prediction.ageWeeks, 0);
    assert.ok(prediction.state);
  });
});

describe('the estimator at its edges', () => {
  const baseline = wakeWindowBaseline(6); // 45-75, mid 60

  function windows(values) {
    return values.map((minutes, i) => ({
      wokeAt: NOW - 3 * DAY + i * 3 * HOUR,
      minutes,
      value: minutes,
      slot: 'midday',
      excluded: false,
      flags: [],
    }));
  }

  it('switches from the reference table to her own data at the third observation', () => {
    assert.equal(estimateWakeWindow(windows([55, 60]), baseline, { now: NOW }).source, 'age-table');
    assert.equal(estimateWakeWindow(windows([55, 60, 50]), baseline, { now: NOW }).source, 'personal');
  });

  it('keeps a floor under the band even when every observation is identical', () => {
    // Zero spread must not become a zero-width window implying minute-level precision.
    const estimate = estimateWakeWindow(windows(Array(8).fill(60)), baseline, { now: NOW });
    assert.equal(estimate.half, 20);
  });

  it('keeps a ceiling over the band for a wildly variable child', () => {
    const estimate = estimateWakeWindow(
      windows([20, 130, 25, 120, 30, 115, 35, 110]),
      baseline,
      { now: NOW }
    );
    assert.equal(estimate.half, 60);
  });
});

describe('clock changes', () => {
  it('counts a 25-hour day correctly when the clocks go back', () => {
    // Europe/London turns back on 25 October 2026. Day boundaries are local, so the arithmetic has
    // to be calendar-based rather than "subtract 86400000".
    const dstNow = new Date(2026, 9, 26, 14, 30, 0).getTime();
    const events = [];
    for (let d = 10; d >= 0; d -= 1) {
      events.push(sleep(at(d, 19, 30, dstNow), at(d, 19, 30, dstNow) + 11 * HOUR));
      events.push(sleep(at(d - 1, 9, 0, dstNow), at(d - 1, 9, 0, dstNow) + 80 * MINUTE));
    }
    const child = { dateOfBirth: dobForAgeWeeks(30, dstNow) };
    const stats = sleepStats(events, child, dstNow, 5);
    const totals = stats.perDay.slice(0, 4).map((d) => d.minutes);
    // The four complete days either side of the change must agree with each other.
    assert.ok(
      Math.max(...totals) - Math.min(...totals) < 15,
      `day totals drift across the clock change: ${totals.join(', ')}`
    );
    assert.equal(predictNextSleep(events, child, dstNow).phase, 3);
  });
});
