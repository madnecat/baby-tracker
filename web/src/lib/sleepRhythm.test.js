/** Tests for the typical day / night summary. Run with `npm test` from web/. Synthetic times only. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asleepShare, rhythmSummary } from './sleepRhythm.js';

const NOW = new Date(2026, 5, 20, 12, 0).getTime(); // midday, mid-June: no DST change nearby
const at = (daysAgo, hour, minute = 0) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
};
const sleep = (start, effectiveEnd) => ({ start, effectiveEnd });

// Every day: naps 10:00-11:00 and 13:00-14:00, asleep 20:30 → 02:00, awake 40 min, asleep 02:40 → 08:30.
const routine = () =>
  [8, 7, 6, 5, 4, 3, 2, 1, 0].flatMap((d) => [
    sleep(at(d, 10), at(d, 11)),
    sleep(at(d, 13), at(d, 14)),
    sleep(at(d, 20, 30), at(d - 1, 2)),
    sleep(at(d - 1, 2, 40), at(d - 1, 8, 30)),
  ]);

describe('asleepShare', () => {
  const H = 3600000;
  const rows = [0, 1].map((d) => ({ from: d * 24 * H, to: (d + 1) * 24 * H }));

  it('is the share of days asleep in each quarter-hour', () => {
    // Day 1: asleep 00:00-01:00. Day 2: asleep 00:30-01:30.
    const blocks = [[{ start: 0, end: H }], [{ start: 24 * H + 0.5 * H, end: 24 * H + 1.5 * H }]];
    const slots = asleepShare(rows, blocks);
    assert.equal(slots.length, 96);
    assert.equal(slots[0], 0.5);
    assert.equal(slots[2], 1);
    assert.equal(slots[5], 0.5);
    assert.equal(slots[8], 0);
  });

  it('leaves out the part of today that has not happened yet', () => {
    const slots = asleepShare([{ from: 0, to: 6 * H }], [[{ start: 0, end: 2 * H }]]);
    assert.equal(slots[0], 1);
    assert.equal(slots[40], 0);
  });
});

describe('rhythmSummary', () => {
  it('is null with fewer than three days of data', () => {
    assert.equal(rhythmSummary([sleep(at(2, 10), at(2, 11)), sleep(at(1, 10), at(1, 11))], NOW, 7), null);
  });

  it('counts the night wake-ups and how long they last', () => {
    const { night } = rhythmSummary(routine(), NOW, 7);
    assert.deepEqual(night.perPeriod, { median: 1, min: 1, max: 1 });
    assert.equal(night.medianMinutes, 40);
    assert.equal(night.usual.length, 1);
    assert.deepEqual([night.usual[0].startMinute, night.usual[0].endMinute], [105, 135]); // around 02:00
    assert.equal(night.usual[0].count, night.periods);
  });

  it('counts the sleeps that start in the day and the awake time before each', () => {
    const { day } = rhythmSummary(routine(), NOW, 7);
    assert.deepEqual(day.perPeriod, { median: 2, min: 2, max: 2 });
    assert.equal(day.medianMinutes, (90 + 120) / 2); // awake 08:30-10:00, then 11:00-13:00
    assert.equal(day.usual.length, 2); // naps start around 10:00 and 13:00
  });

  it('gives, per half-hour of the day, the share of nights with a wake-up starting then', () => {
    const { wakeShare, sleepShare } = rhythmSummary(routine(), NOW, 7);
    assert.equal(wakeShare.length, 48);
    assert.equal(wakeShare[4], 1); // 02:00-02:30 (night wake-up)
    assert.equal(wakeShare[17], 1); // 08:30-09:00: waking in the morning, a day hour, counted from the days
    assert.equal(sleepShare[20], 1); // 10:00-10:30: a nap starts
    assert.equal(sleepShare[41], 1); // 20:30-21:00: the night's first sleep starts
  });

  it('says there are no usual times when wake-ups are spread through the night', () => {
    const wakeHours = [21.5, 23, 0.5, 2, 4, 5.5, 22, 3];
    const spread = wakeHours.flatMap((h, i) => {
      const d = i + 1;
      const wake = h >= 20 ? at(d, 0) + h * 3600000 : at(d - 1, 0) + h * 3600000;
      return [
        sleep(at(d, 10), at(d, 11)),
        sleep(at(d, 20, 30), wake),
        sleep(wake + 30 * 60000, at(d - 1, 8, 30)),
      ];
    });
    const { night } = rhythmSummary(spread, NOW, 9);
    assert.deepEqual(night.usual, []);
  });

  it('ignores short gaps: a feed is not a wake-up', () => {
    const intervals = [8, 7, 6, 5, 4, 3, 2, 1].flatMap((d) => [
      sleep(at(d, 10), at(d, 11)),
      sleep(at(d, 20, 30), at(d, 23)),
      sleep(at(d, 23, 10), at(d - 1, 8, 30)), // 10 minute gap
    ]);
    const { night } = rhythmSummary(intervals, NOW, 9);
    assert.deepEqual(night.perPeriod, { median: 0, min: 0, max: 0 });
    assert.equal(night.medianMinutes, null);
  });
});
