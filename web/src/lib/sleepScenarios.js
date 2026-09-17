/**
 * The named situations the sleep engine has to get right, each as a generated log.
 *
 * This file is the single source of truth for three things that would otherwise drift apart:
 *   - `server/scripts/seed-sleep-scenario.js` loads one into a throwaway household so it can be
 *     looked at by hand,
 *   - `sleepScenarios.test.js` asserts the engine actually produces `expect.state` and friends,
 *   - the walkthrough in the docs tells a human to check `describe` on screen.
 *
 * So a scenario whose description stops matching the code fails the test suite rather than quietly
 * misleading whoever is doing the manual pass.
 *
 * Imports nothing but the fixture generator, for the same reason sleep.js imports nothing: the
 * tests must run under bare `node --test`.
 */

import { dobForAgeWeeks, generateSleepLog } from './sleepFixtures.js';

const MINUTE = 60000;
const HOUR = 3600000;
const DAY = 86400000;

function openSleep(startedAt) {
  return { type: 'sleep', startedAt: new Date(startedAt).toISOString(), endedAt: null, details: {} };
}

function closedSleep(start, end) {
  return {
    type: 'sleep',
    startedAt: new Date(start).toISOString(),
    endedAt: new Date(end).toISOString(),
    details: {},
  };
}

/**
 * Generated days are truncated at their end, so the last sleep a profile emits can have finished
 * hours ago. Where a scenario is about how long she has been awake *right now*, pin that explicitly
 * with a final sleep instead of inferring it from where the generator happened to stop.
 */
function endingAwakeFor(events, now, minutesAwake, napMinutes = 90) {
  const wokeAt = now - minutesAwake * MINUTE;
  return [...events, closedSleep(wokeAt - napMinutes * MINUTE, wokeAt)];
}

/**
 * `expect` is machine-checked; `describe` is what a human is asked to see. Keep them saying the
 * same thing.
 */
export const SLEEP_SCENARIOS = {
  newborn: {
    ageWeeks: 6,
    summary: 'Six weeks old, three weeks of logs, awake right now — the everyday case.',
    expect: { state: 'awake', phase: 1, source: 'personal', disturbed: false, lowQuality: false },
    describe: [
      'Log tab: "Next sleep HH:MM–HH:MM" with "In about N min" underneath',
      'Card footer: "No day/night rhythm yet — sleeps around the clock"',
      'Card: "Based on N of her own wake windows"',
      'Charts: Sleep section with a 24h band, wake windows listed below it',
      'No warning banners at all',
    ],
    build: (now) =>
      endingAwakeFor(
        generateSleepLog({
          kind: 'newborn',
          days: 21,
          seed: 2026,
          endAt: now - 3 * HOUR,
          dob: dobForAgeWeeks(6, now),
        }).events,
        now,
        30
      ),
  },

  asleep: {
    ageWeeks: 6,
    summary: 'Asleep at this very moment — the state a sleep-onset-only design shows nothing for.',
    expect: { state: 'asleep', phase: 1, source: 'personal', pastTypical: false },
    describe: [
      'Log tab: "Asleep since HH:MM · Nm", counting up every second',
      'Underneath: "Usually wakes around HH:MM–HH:MM"',
      'No countdown to a next sleep, and no negative numbers anywhere',
    ],
    build: (now) => [
      ...generateSleepLog({
        kind: 'newborn',
        days: 21,
        seed: 77,
        endAt: now - 50 * MINUTE,
        dob: dobForAgeWeeks(6, now),
      }).events,
      openSleep(now - 35 * MINUTE),
    ],
  },

  'asleep-too-long': {
    ageWeeks: 6,
    summary: 'Asleep well past her usual stretch — the range must not render backwards.',
    expect: { state: 'asleep', pastTypical: true, rangeOrdered: true },
    describe: [
      'Log tab: "Asleep since HH:MM · 4h 00m"',
      'Underneath: "Already longer than her usual stretch — she could wake any time."',
      'NOT a range whose end is before its start — that was a real bug',
    ],
    build: (now) => [
      ...generateSleepLog({
        kind: 'newborn',
        days: 21,
        seed: 78,
        endAt: now - 4 * HOUR,
        dob: dobForAgeWeeks(6, now),
      }).events,
      openSleep(now - 4 * HOUR),
    ],
  },

  overdue: {
    ageWeeks: 6,
    summary: 'Awake far longer than she ever manages — past the predicted window.',
    expect: { state: 'overdue', phase: 1 },
    describe: [
      'Log tab: "Past the usual window"',
      'Underneath: "Expected around HH:MM — she may settle more easily now."',
      'NO negative countdown anywhere',
    ],
    build: (now) =>
      generateSleepLog({
        kind: 'newborn',
        days: 21,
        seed: 79,
        endAt: now - 5 * HOUR,
        dob: dobForAgeWeeks(6, now),
      }).events,
  },

  'first-day': {
    ageWeeks: 3,
    summary: 'Day one of using the app: two sleeps logged, nothing to learn from yet.',
    expect: { state: 'awake', phase: 1, source: 'age-table', confidence: 'low' },
    describe: [
      'Log tab: "Typical at 3 weeks: 30–60 min awake" — the reference table, stated as such',
      'Underneath: "Not enough of Fixture\'s own sleeps logged yet (N/3)"',
      'NO countdown: a reference table must not be dressed up as knowledge about her',
      'Still shows "Last woke HH:MM · Nm ago", which needs no model at all',
    ],
    build: (now) => [
      closedSleep(now - 7 * HOUR, now - 5 * HOUR),
      closedSleep(now - 4 * HOUR, now - 25 * MINUTE),
    ],
  },

  empty: {
    ageWeeks: 3,
    summary: 'Nothing logged at all.',
    expect: { state: 'unknown', phase: 1, source: 'age-table' },
    describe: [
      'Log tab: "Not enough sleep logged yet to say anything useful."',
      'Charts: "No sleep logged yet." and no crash',
    ],
    build: () => [],
  },

  'forgotten-timer': {
    ageWeeks: 6,
    summary: 'A timer left running nine hours ago, with sleeps correctly logged since.',
    expect: { state: 'unknown', suspectRunningSleep: true, statsSurvive: true },
    describe: [
      'Log tab: "Sleep still running since HH:MM" with the note to stop or fix it',
      'Charts: the sleep totals are still CORRECT — roughly a normal day, not zero',
      'The stray timer is excluded; everything logged after it is not. That was a real bug',
    ],
    build: (now) => [
      ...generateSleepLog({
        kind: 'newborn',
        days: 21,
        seed: 80,
        endAt: now - 40 * MINUTE,
        dob: dobForAgeWeeks(6, now),
      }).events,
      openSleep(now - 9 * HOUR),
    ],
  },

  'missing-logs': {
    ageWeeks: 6,
    summary: 'Several sleeps over the last three days never got logged.',
    expect: { lowQuality: true },
    describe: [
      'Log tab: amber banner "Some sleeps look like they weren\'t logged (N of M recent stretches)"',
      'Charts: some wake windows marked "looks like a sleep went unlogged"',
      'A prediction is still shown — the app says the data is thin, it does not go blank',
    ],
    build: (now) =>
      generateSleepLog({
        kind: 'newborn',
        days: 21,
        seed: 81,
        endAt: now - 40 * MINUTE,
        dob: dobForAgeWeeks(6, now),
        omitSleepOnDays: [
          { day: 18, index: 2 },
          { day: 18, index: 5 },
          { day: 19, index: 1 },
          { day: 19, index: 4 },
          { day: 19, index: 6 },
          { day: 20, index: 2 },
          { day: 20, index: 4 },
          { day: 20, index: 6 },
        ],
      }).events,
  },

  stale: {
    ageWeeks: 6,
    summary: 'Logging stopped three days ago.',
    expect: { state: 'unknown', staleHistory: true },
    describe: [
      'Log tab: "No prediction — nothing logged recently", with the DATE of the last sleep',
      'NOT a bare time like "expected around 09:20", which would read as this morning',
    ],
    build: (now) =>
      generateSleepLog({
        kind: 'newborn',
        days: 21,
        seed: 82,
        endAt: now - 3 * DAY,
        dob: dobForAgeWeeks(6, now),
      }).events,
  },

  circadian: {
    ageWeeks: 12,
    summary: 'Twelve weeks: a real night has appeared, naps still ragged. Phase 2.',
    expect: { phase: 2, hasNightWindow: true },
    describe: [
      'Card footer: "Day/night rhythm settled"',
      'Charts footer: "night sits around HH:00–HH:00" — derived from the data, not hardcoded',
      'The prediction may now say nap or night rather than just sleep',
    ],
    build: (now) =>
      generateSleepLog({
        kind: 'circadian',
        days: 21,
        seed: 83,
        endAt: now - 40 * MINUTE,
        dob: dobForAgeWeeks(12, now),
      }).events,
  },

  'naps-settled': {
    ageWeeks: 26,
    summary: 'Six months, three naps a day like clockwork. Phase 3.',
    expect: { phase: 3, naps: 3, disturbed: false },
    describe: [
      'Card footer: "Settled nap regime · 3 naps a day"',
      'Charts: the 24h band shows one long night block and three short day blocks',
    ],
    build: (now) =>
      generateSleepLog({
        kind: 'naps3',
        days: 21,
        seed: 84,
        endAt: now - 40 * MINUTE,
        dob: dobForAgeWeeks(26, now),
      }).events,
  },

  teething: {
    ageWeeks: 26,
    summary: 'A settled six-month-old whose last five nights fell apart. Must NOT lose the phase.',
    expect: { phase: 3, disturbed: true },
    describe: [
      'Card: amber banner "Sleep has been unsettled the last few days (teething, travel, a growth spurt?)"',
      'Card footer STILL says "Settled nap regime" — the phase is frozen, not lost',
      'The predicted window is wider than in the "naps-settled" scenario',
    ],
    build: (now) =>
      generateSleepLog({
        kind: 'naps3',
        days: 30,
        seed: 85,
        endAt: now - 40 * MINUTE,
        dob: dobForAgeWeeks(26, now),
        disturbances: [{ type: 'teething', fromDay: 25, toDay: 30 }],
      }).events,
  },

  travel: {
    ageWeeks: 26,
    summary: 'Four days away with everything shifted three hours. Also must not lose the phase.',
    expect: { phase: 3, disturbed: true },
    describe: [
      'Same as teething: unsettled banner, phase kept',
      'Charts: the 24h band shows the night sitting later than usual',
    ],
    build: (now) =>
      generateSleepLog({
        kind: 'naps3',
        days: 30,
        seed: 86,
        endAt: now - 40 * MINUTE,
        dob: dobForAgeWeeks(26, now),
        disturbances: [{ type: 'travel', fromDay: 26, toDay: 30 }],
      }).events,
  },

  'growth-spurt': {
    ageWeeks: 26,
    summary: 'Two days of waking to feed repeatedly. The shortest disturbance of the three.',
    expect: { phase: 3 },
    describe: [
      'Card footer STILL says "Settled nap regime"',
      'Two bad nights are not enough to change anything about the prediction shape',
    ],
    build: (now) =>
      generateSleepLog({
        kind: 'naps3',
        days: 30,
        seed: 88,
        endAt: now - 40 * MINUTE,
        dob: dobForAgeWeeks(26, now),
        disturbances: [{ type: 'growth-spurt', fromDay: 28, toDay: 30 }],
      }).events,
  },

  regression: {
    ageWeeks: 26,
    summary: 'Four weeks with no consolidated night. This one SHOULD step the phase down.',
    expect: { phaseBelow: 3, disturbed: false },
    describe: [
      'Card footer is NO LONGER "Settled nap regime" — it has stepped down',
      'The unsettled banner is gone: once bad nights are the baseline they stop reading as a shock',
      'The deliberate mirror of the teething case — compare the two side by side',
    ],
    build: (now) =>
      generateSleepLog({
        kind: 'naps3',
        days: 45,
        seed: 87,
        endAt: now - 40 * MINUTE,
        dob: dobForAgeWeeks(26, now),
        disturbances: [{ type: 'regression', fromDay: 17, toDay: 45 }],
      }).events,
  },

  consolidating: {
    ageWeeks: 14,
    summary: 'A night visibly consolidating over six weeks — caught mid-promotion from phase 1 to 2.',
    expect: { phase: 2 },
    describe: [
      'Card footer: "Day/night rhythm settled" — the app has noticed the change',
      'Charts: the 24h band shows one clearly dominant night block',
    ],
    build: (now) =>
      generateSleepLog({
        kind: 'consolidating',
        days: 42,
        seed: 19,
        endAt: now - 40 * MINUTE,
        dob: dobForAgeWeeks(14, now),
      }).events,
  },
};

/** The child profile a scenario expects, so the seeder and the tests agree on her age. */
export function scenarioChild(name, now) {
  return {
    name: 'Fixture',
    dateOfBirth: dobForAgeWeeks(SLEEP_SCENARIOS[name].ageWeeks, now),
    sex: 'female',
  };
}
