/**
 * Tests for the sleep prediction engine. Run with `npm test` (which is `node --test`) from web/.
 *
 * These are a local development tool, not a gate: this repo has no CI, so nothing runs them for you
 * before a deploy. They exist because the engine is the first thing in this app with real
 * algorithmic content, and because most of what it does cannot be checked by looking at the screen
 * — the phase machine's whole job is to behave correctly over weeks.
 *
 * The phase and disturbance cases run against generated logs (sleepFixtures.js). Those fixtures
 * encode assumptions about infant sleep that no data of ours has confirmed yet, so passing them
 * means the engine is consistent with those assumptions — not that the assumptions are right. The
 * sensitivity sweep at the bottom is the honest part: it shows the phase answer does not balance on
 * the exact value of a threshold nobody has calibrated.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  dataQuality,
  detectPhase,
  estimateWakeWindow,
  normalizeSleeps,
  observedWakeWindows,
  predictNextSleep,
  sleepMinutesInInterval,
  sleepStats,
} from './sleep.js';
import { PROVISIONAL_TUNABLES, wakeWindowBaseline } from './sleepGuidance.js';
import { dobForAgeWeeks, generateSleepLog, sleepOnsets } from './sleepFixtures.js';

const MINUTE = 60000;
const HOUR = 3600000;
const DAY = 86400000;

// A fixed local wall-clock moment, well away from any DST boundary, so these run the same in any
// timezone and on any day.
const NOW = new Date(2026, 5, 15, 14, 30, 0).getTime();

let nextId = 1;
function sleepEvent(start, end) {
  return {
    id: nextId++,
    type: 'sleep',
    startedAt: new Date(start).toISOString(),
    endedAt: end == null ? null : new Date(end).toISOString(),
    details: {},
  };
}

function feedEvent(at) {
  return {
    id: nextId++,
    type: 'breastfeeding',
    startedAt: new Date(at).toISOString(),
    endedAt: new Date(at + 20 * MINUTE).toISOString(),
    details: {},
  };
}

function windowsOf(values, { from = NOW - 3 * DAY, spacing = 3 * HOUR } = {}) {
  return values.map((minutes, i) => ({
    wokeAt: from + i * spacing,
    sleptAt: from + i * spacing + minutes * MINUTE,
    minutes,
    value: minutes,
    slot: 'midday',
    excluded: false,
    flags: [],
  }));
}

// ---------------------------------------------------------------------------

describe('normalizeSleeps', () => {
  it('merges overlapping sleeps rather than counting the overlap twice', () => {
    // The MCP tool logging a sleep retroactively on top of one the timer already recorded.
    const events = [
      sleepEvent(NOW - 5 * HOUR, NOW - 3 * HOUR),
      sleepEvent(NOW - 4 * HOUR, NOW - 2 * HOUR),
    ];
    const { intervals } = normalizeSleeps(events, NOW);
    assert.equal(intervals.length, 1);
    assert.equal(sleepMinutesInInterval(intervals, NOW - 6 * HOUR, NOW), 180);
  });

  it('drops zero and negative durations', () => {
    const events = [
      sleepEvent(NOW - 2 * HOUR, NOW - 3 * HOUR), // mistyped retroactive entry
      sleepEvent(NOW - 90 * MINUTE, NOW - 90 * MINUTE),
    ];
    assert.equal(normalizeSleeps(events, NOW).intervals.length, 0);
  });

  it('does not let a timer left running swallow everything logged after it', () => {
    // An open interval notionally runs until now, so a naive merge absorbs every later sleep into
    // it — and because it is then marked suspect, all of them drop out of every total at once. The
    // stats would silently read zero exactly when nobody is looking.
    const events = [
      sleepEvent(NOW - 12 * HOUR, null), // forgotten at 02:30
      sleepEvent(NOW - 8 * HOUR, NOW - 6 * HOUR),
      sleepEvent(NOW - 4 * HOUR, NOW - 3 * HOUR),
      sleepEvent(NOW - 2 * HOUR, NOW - 90 * MINUTE),
    ];
    const { intervals } = normalizeSleeps(events, NOW);
    assert.equal(intervals.filter((s) => !s.suspect).length, 3);
    assert.equal(sleepMinutesInInterval(intervals, NOW - 12 * HOUR, NOW), 210);

    const stats = sleepStats(events, { dateOfBirth: dobForAgeWeeks(6, NOW) }, NOW);
    assert.equal(stats.rolling24, 210);
    assert.equal(stats.sleepCount24, 3);
  });

  it('keeps a normal running sleep but flags one that has clearly been left running', () => {
    const history = [
      sleepEvent(NOW - 30 * HOUR, NOW - 28 * HOUR),
      sleepEvent(NOW - 25 * HOUR, NOW - 23 * HOUR),
      sleepEvent(NOW - 20 * HOUR, NOW - 18 * HOUR),
    ];

    const running = normalizeSleeps([...history, sleepEvent(NOW - 40 * MINUTE, null)], NOW);
    assert.equal(running.openSleep.suspect, false);

    const forgotten = normalizeSleeps([...history, sleepEvent(NOW - 9 * HOUR, null)], NOW);
    assert.equal(forgotten.openSleep.suspect, true);
    // The phantom hours must not reach any total.
    assert.equal(sleepMinutesInInterval(forgotten.intervals, NOW - 9 * HOUR, NOW), 0);
  });
});

describe('sleepMinutesInInterval', () => {
  it('splits a sleep that crosses midnight instead of giving it all to one day', () => {
    const midnight = new Date(2026, 5, 15, 0, 0, 0).getTime();
    const { intervals } = normalizeSleeps(
      [sleepEvent(midnight - 50 * MINUTE, midnight + 190 * MINUTE)],
      NOW
    );
    assert.equal(sleepMinutesInInterval(intervals, midnight - DAY, midnight), 50);
    assert.equal(sleepMinutesInInterval(intervals, midnight, midnight + DAY), 190);
  });
});

describe('observedWakeWindows', () => {
  const ageWeeks = 6; // baseline 45-75 min, so windows over 120 min get audited

  it('keeps ordinary windows and ignores a double-tap', () => {
    const events = [
      sleepEvent(NOW - 6 * HOUR, NOW - 5 * HOUR),
      sleepEvent(NOW - 5 * HOUR + 2 * MINUTE, NOW - 4 * HOUR), // same sleep, tapped twice
      sleepEvent(NOW - 3 * HOUR, NOW - 2 * HOUR),
    ];
    const { intervals } = normalizeSleeps(events, NOW);
    const windows = observedWakeWindows(intervals, events, ageWeeks, NOW);
    assert.equal(windows.length, 1);
    assert.equal(windows[0].minutes, 60);
  });

  it('flags a long window whose middle has no events at all as a missed sleep', () => {
    const wake = NOW - 5 * HOUR;
    const events = [
      sleepEvent(wake - HOUR, wake),
      sleepEvent(wake + 4 * HOUR, wake + 5 * HOUR),
      feedEvent(wake + 15 * MINUTE), // fed on waking...
      feedEvent(wake + 3 * HOUR + 30 * MINUTE), // ...then nothing for nearly three hours
    ];
    const { intervals } = normalizeSleeps(events, NOW);
    const [window] = observedWakeWindows(intervals, events, ageWeeks, NOW);
    assert.equal(window.excluded, true);
    assert.deepEqual(window.flags, ['probable-unlogged-sleep']);
  });

  it('keeps an equally long window that is full of feeds — cluster feeding is real', () => {
    const wake = NOW - 5 * HOUR;
    const events = [
      sleepEvent(wake - HOUR, wake),
      sleepEvent(wake + 4 * HOUR, wake + 5 * HOUR),
      feedEvent(wake + 20 * MINUTE),
      feedEvent(wake + 80 * MINUTE),
      feedEvent(wake + 140 * MINUTE),
      feedEvent(wake + 200 * MINUTE),
    ];
    const { intervals } = normalizeSleeps(events, NOW);
    const [window] = observedWakeWindows(intervals, events, ageWeeks, NOW);
    assert.equal(window.excluded, false);
  });

  it('flags a long window with nothing logged in it at all', () => {
    const wake = NOW - 5 * HOUR;
    const events = [sleepEvent(wake - HOUR, wake), sleepEvent(wake + 4 * HOUR, wake + 5 * HOUR)];
    const { intervals } = normalizeSleeps(events, NOW);
    const [window] = observedWakeWindows(intervals, events, ageWeeks, NOW);
    assert.deepEqual(window.flags, ['no-corroboration']);
  });

  it('spots the merged windows a forgotten sleep leaves behind', () => {
    const log = { kind: 'newborn', days: 14, dob: dobForAgeWeeks(6, NOW), seed: 71, endAt: NOW };
    const withHoles = generateSleepLog({
      ...log,
      omitSleepOnDays: [
        { day: 11, index: 3 },
        { day: 12, index: 2 },
        { day: 13, index: 3 },
      ],
    });
    const windows = observedWakeWindows(
      normalizeSleeps(withHoles.events, NOW).intervals,
      withHoles.events,
      6,
      NOW
    );
    const flagged = windows.filter((w) => w.excluded);
    assert.ok(flagged.length > 0, 'the merged windows should have been spotted');
    // And nothing normal-looking got caught in the net.
    assert.ok(
      flagged.every((w) => w.minutes > 150),
      'only implausibly long windows should be excluded'
    );
  });

  it('keeps the predicted window from being inflated by merged observations', () => {
    // Worth being precise about what this buys, because it is less than it first appears: the
    // median already shrugs off one merged window, so excluding them barely moves the *estimate*.
    // What it protects is the *band* — a merged window inflates the spread the band is computed
    // from, and a needlessly wide band is a card that tells the parent nothing.
    const baseline = wakeWindowBaseline(6);
    const log = { kind: 'newborn', days: 14, dob: dobForAgeWeeks(6, NOW), seed: 73, endAt: NOW };
    const withHoles = generateSleepLog({
      ...log,
      omitSleepOnDays: [
        { day: 11, index: 3 },
        { day: 12, index: 2 },
        { day: 13, index: 3 },
      ],
    });
    const windows = observedWakeWindows(
      normalizeSleeps(withHoles.events, NOW).intervals,
      withHoles.events,
      6,
      NOW
    );
    const detected = estimateWakeWindow(windows, baseline, { now: NOW });
    const ignored = estimateWakeWindow(
      windows.map((w) => ({ ...w, excluded: false, value: w.minutes })),
      baseline,
      { now: NOW }
    );
    assert.ok(
      detected.half < ignored.half,
      `band was not tightened: ${detected.half} vs ${ignored.half}`
    );
  });

  it('keeps the estimate stable when sleeps go unlogged', () => {
    // Across seeds, because a single seed measures sampling noise as much as anything: losing three
    // sleeps also loses the real wake windows either side of them, so some drift is honest.
    const drifts = [71, 72, 73, 74].map((seed) => {
      const log = { kind: 'newborn', days: 14, dob: dobForAgeWeeks(6, NOW), seed, endAt: NOW };
      const complete = generateSleepLog(log);
      const withHoles = generateSleepLog({
        ...log,
        omitSleepOnDays: [
          { day: 11, index: 3 },
          { day: 12, index: 2 },
          { day: 13, index: 3 },
        ],
      });
      const before = predictNextSleep(complete.events, complete.child, NOW);
      const after = predictNextSleep(withHoles.events, withHoles.child, NOW);
      return Math.abs(after.minutes - before.minutes);
    });
    const worst = Math.max(...drifts);
    assert.ok(worst < 25, `missing sleeps moved the estimate by up to ${worst.toFixed(0)} minutes`);
  });

  it('reports poor logging rather than hiding it', () => {
    const windows = [
      ...windowsOf([55, 60, 50]),
      { ...windowsOf([240])[0], wokeAt: NOW - HOUR, excluded: true, flags: ['no-corroboration'] },
      { ...windowsOf([240])[0], wokeAt: NOW - 2 * HOUR, excluded: true, flags: ['no-corroboration'] },
    ];
    assert.equal(dataQuality(windows, 3, NOW).lowQuality, true);
  });
});

describe('estimateWakeWindow', () => {
  const baseline = wakeWindowBaseline(6); // 45-75, mid 60

  it('falls back to the age table, and says so, when there is nothing to learn from', () => {
    const estimate = estimateWakeWindow([], baseline, { now: NOW });
    assert.equal(estimate.source, 'age-table');
    assert.equal(estimate.point, baseline.mid);
    assert.equal(estimate.samples, 0);
  });

  it('lets the child’s own data override the reference table once there is enough of it', () => {
    // Ten observations all saying 100 minutes, against a table that says 45-75. The app must say
    // what it has seen, not what the table says.
    const estimate = estimateWakeWindow(windowsOf(Array(10).fill(100)), baseline, { now: NOW });
    assert.equal(estimate.source, 'personal');
    assert.ok(estimate.point > 95, `expected ~100, got ${estimate.point}`);
  });

  it('survives one contaminated observation — the forgotten-timer case', () => {
    const clean = [55, 60, 50, 58, 62, 54, 57, 61, 53];
    const withOutlier = windowsOf([...clean, 180]);
    const estimate = estimateWakeWindow(withOutlier, baseline, { now: NOW });
    assert.ok(
      estimate.point < 70,
      `one bad observation moved the estimate to ${estimate.point} minutes`
    );
  });

  it('widens the band and leans back on the table while sleep is disturbed', () => {
    const windows = windowsOf([55, 60, 50, 58, 62, 54]);
    const calm = estimateWakeWindow(windows, baseline, { now: NOW });
    const disturbed = estimateWakeWindow(windows, baseline, { now: NOW, disturbed: true });
    assert.ok(disturbed.half > calm.half);
  });
});

// ---------------------------------------------------------------------------
// The phase matrix
// ---------------------------------------------------------------------------

describe('phase detection across ages', () => {
  const cases = [
    {
      name: '2 weeks, sleeping round the clock',
      log: { kind: 'newborn', days: 14, dob: dobForAgeWeeks(2, NOW), seed: 11 },
      phase: 1,
    },
    {
      name: '6 weeks, still no rhythm',
      log: { kind: 'newborn', days: 21, dob: dobForAgeWeeks(6, NOW), seed: 12 },
      phase: 1,
    },
    {
      name: '10 weeks, old enough for a rhythm but without one',
      log: { kind: 'newborn-older', days: 21, dob: dobForAgeWeeks(10, NOW), seed: 13 },
      phase: 1,
    },
    {
      name: '12 weeks, night established, naps still ragged',
      log: { kind: 'circadian', days: 21, dob: dobForAgeWeeks(12, NOW), seed: 14 },
      phase: 2,
    },
    {
      name: '5 months, three settled naps',
      log: { kind: 'naps3', days: 21, dob: dobForAgeWeeks(22, NOW), seed: 15 },
      phase: 3,
      naps: 3,
    },
    {
      name: '13 months, two settled naps',
      log: { kind: 'naps2', days: 21, dob: dobForAgeWeeks(56, NOW), seed: 16 },
      phase: 3,
      naps: 2,
    },
  ];

  for (const testCase of cases) {
    it(testCase.name + ' -> phase ' + testCase.phase, () => {
      const { events, child } = generateSleepLog({ ...testCase.log, endAt: NOW });
      const prediction = predictNextSleep(events, child, NOW);
      assert.equal(prediction.phase, testCase.phase);
      if (testCase.naps) assert.equal(prediction.napRegime.naps, testCase.naps);
    });
  }

  it('survives a day nobody logged without losing the nap regime', () => {
    // One holiday or one flat phone should not hold a settled child back a phase for a week.
    const log = { kind: 'naps3', days: 21, dob: dobForAgeWeeks(26, NOW), seed: 20, endAt: NOW };
    const { events, child } = generateSleepLog(log);
    const blankDay = new Date(NOW - 3 * DAY).toDateString();
    const withGap = events.filter((e) => new Date(e.startedAt).toDateString() !== blankDay);

    assert.equal(predictNextSleep(events, child, NOW).phase, 3);
    assert.equal(predictNextSleep(withGap, child, NOW).phase, 3);
  });

  it('says nothing about naps, nights or bedtimes while unstructured', () => {
    const { events, child } = generateSleepLog({
      kind: 'newborn',
      days: 21,
      dob: dobForAgeWeeks(6, NOW),
      seed: 17,
      endAt: NOW,
    });
    const prediction = predictNextSleep(events, child, NOW);
    assert.equal(prediction.phase, 1);
    assert.equal(prediction.nightWindow, null);
    assert.equal(prediction.napRegime, null);
    assert.ok(prediction.kind === 'sleep' || prediction.kind == null);
  });

  it('derives the night window from the data instead of assuming 19:00', () => {
    const { events, child } = generateSleepLog({
      kind: 'circadian',
      days: 21,
      dob: dobForAgeWeeks(12, NOW),
      seed: 18,
      endAt: NOW,
    });
    const { nightWindow } = predictNextSleep(events, child, NOW);
    assert.ok(nightWindow, 'expected a derived night window in phase 2');
    // The fixture puts the night at 19:45; the derived window should sit around it, not on a
    // hardcoded boundary.
    assert.ok(
      nightWindow.startHour >= 18 && nightWindow.startHour <= 22,
      `derived night start ${nightWindow.startHour} is implausible for this fixture`
    );
  });

  it('crosses from unstructured to circadian partway through a consolidating series', () => {
    const days = 42;
    const log = {
      kind: 'consolidating',
      days,
      dob: dobForAgeWeeks(14, NOW),
      seed: 19,
      endAt: NOW,
    };
    const { events, child } = generateSleepLog(log);

    const phaseAt = (daysAgo) => {
      const at = NOW - daysAgo * DAY;
      const visible = events.filter((e) => new Date(e.startedAt).getTime() < at);
      return predictNextSleep(visible, child, at).phase;
    };

    assert.equal(phaseAt(days - 8), 1, 'should still be unstructured early in the series');
    assert.equal(phaseAt(0), 2, 'should have reached a circadian rhythm by the end');
  });
});

// ---------------------------------------------------------------------------
// Disturbances must not cost a phase
// ---------------------------------------------------------------------------

describe('disturbances', () => {
  const settled = { kind: 'naps3', dob: dobForAgeWeeks(26, NOW), endAt: NOW };

  for (const [name, type, length] of [
    ['teething', 'teething', 5],
    ['travel', 'travel', 4],
    ['a growth spurt', 'growth-spurt', 2],
  ]) {
    it(name + ' does not drop the phase', () => {
      const days = 30;
      const { events, child } = generateSleepLog({
        ...settled,
        days,
        seed: 21,
        disturbances: [{ type, fromDay: days - length, toDay: days }],
      });
      const prediction = predictNextSleep(events, child, NOW);
      assert.equal(prediction.phase, 3, `${name} should not have changed the phase`);
      assert.equal(prediction.disturbed, true, `${name} should have been noticed`);
      assert.ok(prediction.basis.flags.includes('disturbed'));
    });
  }

  it('widens the predicted window while disturbed rather than pretending to be precise', () => {
    const days = 30;
    const base = generateSleepLog({ ...settled, days, seed: 22 });
    const shaken = generateSleepLog({
      ...settled,
      days,
      seed: 22,
      disturbances: [{ type: 'teething', fromDay: days - 5, toDay: days }],
    });
    const calm = predictNextSleep(base.events, base.child, NOW);
    const disturbed = predictNextSleep(shaken.events, shaken.child, NOW);
    if (calm.from != null && disturbed.from != null) {
      assert.ok(disturbed.to - disturbed.from >= calm.to - calm.from);
    }
  });

  it('does eventually step down for a regression that never ends', () => {
    // The mirror image of the tests above: what makes a disturbance a disturbance is that it stops.
    // Once the bad nights *are* the baseline, they stop reading as a shock and the phase gives way.
    const days = 45;
    const { events, child } = generateSleepLog({
      ...settled,
      days,
      seed: 23,
      disturbances: [{ type: 'regression', fromDay: 17, toDay: days }],
    });
    const prediction = predictNextSleep(events, child, NOW);
    assert.ok(prediction.phase < 3, `expected a step down, still at phase ${prediction.phase}`);
  });
});

// ---------------------------------------------------------------------------
// What the card is actually told to show
// ---------------------------------------------------------------------------

describe('predictNextSleep states', () => {
  const child = { name: 'Fixture', dateOfBirth: dobForAgeWeeks(6, NOW), sex: 'female' };

  it('has nothing to say with no history, and does not crash saying it', () => {
    const prediction = predictNextSleep([], child, NOW);
    assert.equal(prediction.state, 'unknown');
    assert.equal(prediction.from, null);
    assert.equal(prediction.basis.source, 'age-table');
  });

  it('survives a child with no date of birth', () => {
    const prediction = predictNextSleep([sleepEvent(NOW - 3 * HOUR, NOW - HOUR)], null, NOW);
    assert.ok(prediction.state);
    assert.equal(prediction.ageWeeks, null);
  });

  it('predicts a wake time while she is asleep', () => {
    const { events } = generateSleepLog({
      kind: 'newborn',
      days: 10,
      dob: child.dateOfBirth,
      seed: 31,
      endAt: NOW - 40 * MINUTE,
    });
    const asleep = [...events, sleepEvent(NOW - 35 * MINUTE, null)];
    const prediction = predictNextSleep(asleep, child, NOW);
    assert.equal(prediction.state, 'asleep');
    assert.equal(prediction.asleepSince, NOW - 35 * MINUTE);
    assert.ok(prediction.from >= NOW, 'the window to wake must not start in the past');
    assert.ok(prediction.to > prediction.from);
  });

  it('goes overdue instead of counting down past zero', () => {
    const { events } = generateSleepLog({
      kind: 'newborn',
      days: 10,
      dob: child.dateOfBirth,
      seed: 32,
      endAt: NOW - 6 * HOUR,
    });
    // Awake for six hours at six weeks old: far past any plausible window.
    const withLongWake = [...events, sleepEvent(NOW - 7 * HOUR, NOW - 6 * HOUR)];
    const prediction = predictNextSleep(withLongWake, child, NOW);
    assert.equal(prediction.state, 'overdue');
    assert.ok(prediction.point < NOW, 'overdue means the window has already passed');
  });

  it('refuses to guess from a timer someone forgot to stop', () => {
    const { events } = generateSleepLog({
      kind: 'newborn',
      days: 10,
      dob: child.dateOfBirth,
      seed: 33,
      endAt: NOW - 10 * HOUR,
    });
    const prediction = predictNextSleep([...events, sleepEvent(NOW - 9 * HOUR, null)], child, NOW);
    assert.equal(prediction.state, 'unknown');
    assert.equal(prediction.suspectRunningSleep, true);
  });

  it('never renders a backwards range when she sleeps past her usual stretch', () => {
    const { events } = generateSleepLog({
      kind: 'newborn',
      days: 10,
      dob: child.dateOfBirth,
      seed: 34,
      endAt: NOW - 4 * HOUR,
    });
    // Asleep for four hours against a newborn's typical two: the expected wake time is long past.
    const prediction = predictNextSleep([...events, sleepEvent(NOW - 4 * HOUR, null)], child, NOW);
    assert.equal(prediction.state, 'asleep');
    assert.ok(prediction.to > prediction.from, 'the wake window must not invert');
    assert.ok(prediction.from >= NOW);
    assert.equal(prediction.pastTypical, true);
  });

  it('stops predicting when nothing has been logged for a day', () => {
    // Otherwise a clock-only "expected around 09:20" built on three-day-old data is
    // indistinguishable from one built this morning.
    const { events } = generateSleepLog({
      kind: 'newborn',
      days: 10,
      dob: child.dateOfBirth,
      seed: 35,
      endAt: NOW - 3 * DAY,
    });
    const prediction = predictNextSleep(events, child, NOW);
    assert.equal(prediction.state, 'unknown');
    assert.equal(prediction.staleHistory, true);
    assert.equal(prediction.from, null);
  });

  it('shows the age table with no pretence of personal knowledge on day one', () => {
    const events = [sleepEvent(NOW - 3 * HOUR, NOW - 90 * MINUTE)];
    const prediction = predictNextSleep(events, child, NOW);
    assert.equal(prediction.basis.source, 'age-table');
    assert.equal(prediction.confidence, 'low');
    assert.equal(prediction.lastWakeAt, NOW - 90 * MINUTE);
  });
});

describe('sleepStats', () => {
  it('totals the last rolling 24 hours, not a calendar day', () => {
    const { events, child } = generateSleepLog({
      kind: 'newborn',
      days: 7,
      dob: dobForAgeWeeks(6, NOW),
      seed: 41,
      endAt: NOW,
    });
    const stats = sleepStats(events, child, NOW);
    assert.ok(stats.rolling24 > 8 * 60 && stats.rolling24 < 20 * 60, `got ${stats.rolling24} min`);
    assert.equal(stats.perDay.length, 7);
    assert.ok(stats.target.min > 0);
  });
});

// ---------------------------------------------------------------------------
// Calibration, and how much the answer depends on numbers nobody has calibrated
// ---------------------------------------------------------------------------

describe('calibration', () => {
  /** Replays the app's own prediction at every real sleep onset in a generated log. */
  function coverageFor(log) {
    const { events, child } = generateSleepLog(log);
    const onsets = sleepOnsets(events).filter((t) => t > log.endAt - 5 * DAY);
    let covered = 0;
    let total = 0;
    for (const onset of onsets) {
      const at = onset - MINUTE;
      const visible = events.filter((e) => new Date(e.startedAt).getTime() < at);
      const prediction = predictNextSleep(visible, child, at);
      if (prediction.from == null || prediction.state === 'asleep') continue;
      total += 1;
      if (onset >= prediction.from && onset <= prediction.to) covered += 1;
    }
    return { rate: total ? covered / total : 0, total };
  }

  it('brackets the real sleep often enough to be useful, without being uselessly wide', () => {
    const { rate, total } = coverageFor({
      kind: 'newborn',
      days: 21,
      dob: dobForAgeWeeks(6, NOW),
      seed: 51,
      endAt: NOW,
    });
    assert.ok(total > 20, `only ${total} predictions replayed`);
    assert.ok(rate > 0.55, `window caught the real sleep only ${(rate * 100).toFixed(0)}% of the time`);
    // A band that is always right is simply too wide to tell anyone anything.
    assert.ok(rate < 0.98, `window is too wide: ${(rate * 100).toFixed(0)}% coverage`);
  });
});

describe('sensitivity of the phase thresholds', () => {
  /**
   * The point of this one is honesty, not correctness. `nightConsolidationRatio` is a number nobody
   * has calibrated against real data, so what matters is whether the answer balances on it. If phase
   * detection holds across a wide range of values, the exact choice does not matter much; if it
   * flips at 2.1, the design is resting on a guess and we should know that.
   */
  it('gives the same phases across a wide range of the night-consolidation ratio', () => {
    const unstructured = generateSleepLog({
      kind: 'newborn',
      days: 21,
      dob: dobForAgeWeeks(6, NOW),
      seed: 61,
      endAt: NOW,
    });
    const rhythmic = generateSleepLog({
      kind: 'naps3',
      days: 21,
      dob: dobForAgeWeeks(26, NOW),
      seed: 62,
      endAt: NOW,
    });

    const original = PROVISIONAL_TUNABLES.nightConsolidationRatio;
    const stable = [];
    try {
      for (const ratio of [1.5, 1.75, 2, 2.5, 3, 4]) {
        PROVISIONAL_TUNABLES.nightConsolidationRatio = ratio;
        const a = predictNextSleep(unstructured.events, unstructured.child, NOW).phase;
        const b = predictNextSleep(rhythmic.events, rhythmic.child, NOW).phase;
        if (a === 1 && b === 3) stable.push(ratio);
      }
    } finally {
      PROVISIONAL_TUNABLES.nightConsolidationRatio = original;
    }

    assert.deepEqual(
      stable,
      [1.5, 1.75, 2, 2.5, 3, 4],
      `phase detection is sensitive to the ratio; it only held for ${stable.join(', ')}`
    );
  });
});
