/**
 * Tests for the night-progress helpers. Run with `npm test` from web/.
 * Synthetic logs only: no real child's data belongs in this (public) repository.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PROVISIONAL_TUNABLES,
  WAKE_WINDOWS_BY_AGE,
  longestNightStretchTypical,
  totalSleepTarget,
} from './sleepGuidance.js';
import { nightlyStretches, stretchTrend } from './sleepProgress.js';

const MINUTE = 60000;

// Local wall-clock times, mid-June: no DST boundary, same result in any timezone.
const at = (day, hour, minute = 0) => new Date(2026, 5, day, hour, minute, 0).getTime();
const NOW = at(20, 12);

let nextId = 1;
const sleep = (start, end) => ({
  id: nextId++,
  type: 'sleep',
  startedAt: new Date(start).toISOString(),
  endedAt: new Date(end).toISOString(),
  details: {},
});

/** A night that starts the evening of `day`: stretches given as [startMinutesAfter19h, lengthMinutes]. */
function night(day, parts) {
  return parts.map(([offset, length]) => {
    const start = at(day, 19) + offset * MINUTE;
    return sleep(start, start + length * MINUTE);
  });
}

describe('nightlyStretches', () => {
  it('measures the longest stretch and the pause between stretches', () => {
    // 21:00-03:00 (360), 20 minutes awake, 03:20-06:30 (190).
    const events = night(18, [[120, 360], [500, 190]]);
    const row = nightlyStretches(events, NOW).find((r) => r.key === '2026-06-18');
    assert.equal(row.hasData, true);
    assert.equal(row.longest, 360);
    assert.equal(row.wakes, 1);
    assert.equal(row.awake, 20);
  });

  it('does not count a pause shorter than ten minutes as a wake', () => {
    const events = night(18, [[120, 200], [325, 200]]); // 5 minutes between them
    const row = nightlyStretches(events, NOW).find((r) => r.key === '2026-06-18');
    assert.equal(row.longest, 405);
    assert.equal(row.wakes, 0);
  });

  it('keeps the whole stretch when it runs past 07:00', () => {
    const events = night(17, [[180, 600]]); // 22:00 -> 08:00
    const row = nightlyStretches(events, NOW).find((r) => r.key === '2026-06-17');
    assert.equal(row.longest, 600);
  });

  it('does not credit the night with an evening nap it was joined to', () => {
    // Nap 17:00-19:05, bedtime 19:10 (5 minutes later, so one stretch) to 05:10: 600 minutes of night.
    const events = [
      sleep(at(17, 17), at(17, 19, 5)),
      sleep(at(17, 19, 10), at(18, 5, 10)),
    ];
    const row = nightlyStretches(events, NOW).find((r) => r.key === '2026-06-17');
    assert.equal(row.longest, 610 - 0); // from 19:00, not from 17:00
    assert.equal(row.wakes, 0);
  });

  it('does not count an evening nap followed by a late bedtime as a night wake', () => {
    const events = [
      sleep(at(17, 18), at(17, 19, 5)),
      sleep(at(17, 19, 40), at(18, 5)),
    ];
    const row = nightlyStretches(events, NOW).find((r) => r.key === '2026-06-17');
    assert.equal(row.wakes, 0);
    assert.equal(row.awake, 0);
  });

  it('skips a night with a long stretch nobody logged instead of calling it awake', () => {
    // 19:00-23:00, nothing for seven hours, then 06:00-08:00.
    const events = [sleep(at(17, 19), at(17, 23)), sleep(at(18, 6), at(18, 8))];
    const row = nightlyStretches(events, NOW).find((r) => r.key === '2026-06-17');
    assert.equal(row.hasData, false);
  });

  it('skips an unlogged night instead of reporting zero', () => {
    const events = night(18, [[120, 360]]);
    const rows = nightlyStretches(events, NOW);
    const empty = rows.find((r) => r.key === '2026-06-17');
    assert.equal(empty.hasData, false);
    assert.equal(empty.longest, 0);
  });

  it('leaves out this evening, which has not started', () => {
    const events = night(19, [[120, 360]]); // evening of the 19th, NOW is noon on the 20th -> finished
    const tonight = night(20, [[0, 200]]);
    const rows = nightlyStretches([...events, ...tonight], NOW);
    const keys = rows.map((r) => r.key);
    assert.ok(keys.includes('2026-06-19'));
    assert.ok(!keys.includes('2026-06-20'));
    assert.ok(rows.every((r) => !r.provisional));
  });

  it('reports the night under way, flagged as provisional', () => {
    // Slept 19:30-23:30 and 00:30-03:00; it is 05:30 on the 20th, the night ends at 07:00.
    const events = [sleep(at(19, 19, 30), at(19, 23, 30)), sleep(at(20, 0, 30), at(20, 3))];
    const rows = nightlyStretches(events, at(20, 5, 30));
    const row = rows.at(-1);
    assert.equal(row.key, '2026-06-19');
    assert.equal(row.provisional, true);
    assert.equal(row.hasData, true);
    assert.equal(row.longest, 240);
    assert.ok(rows.slice(0, -1).every((r) => !r.provisional));
  });

  it('keeps the night under way out of the trend', () => {
    const rows = Array.from({ length: 16 }, (_, i) => ({
      start: at(1 + i, 19), hasData: true, provisional: false, longest: 180,
    }));
    const withTonight = [...rows, { start: at(17, 19), hasData: true, provisional: true, longest: 20 }];
    assert.equal(stretchTrend(withTonight).nights, 16);
  });
});

describe('stretchTrend', () => {
  const rowsFrom = (values) =>
    values.map((longest, i) => ({ hasData: true, longest, start: at(1 + i, 19) }));

  it('finds a steady climb and trusts it', () => {
    const trend = stretchTrend(rowsFrom(Array.from({ length: 16 }, (_, i) => 150 + 10 * i)));
    assert.equal(trend.perWeek, 70);
    assert.equal(trend.clear, true);
  });

  it('is not moved by one freak night', () => {
    const values = Array.from({ length: 16 }, (_, i) => 150 + 10 * i);
    values[6] = 600;
    assert.ok(Math.abs(stretchTrend(rowsFrom(values)).perWeek - 70) <= 5);
  });

  it('calls pure noise unclear', () => {
    const values = [190, 150, 220, 160, 210, 140, 230, 170, 200, 150, 215, 165, 205, 155, 195, 160];
    assert.equal(stretchTrend(rowsFrom(values)).clear, false);
  });

  it('says nothing before it has enough nights', () => {
    assert.equal(stretchTrend(rowsFrom([180, 190, 200])), null);
  });

  it('does not quote a weekly rate from nights squeezed into under two weeks', () => {
    const rows = Array.from({ length: 16 }, (_, i) => ({ hasData: true, longest: 150 + 10 * i, start: at(1, 19) + i * 0.5 * 86400000 }));
    assert.equal(stretchTrend(rows), null);
  });
});

describe('reference values', () => {
  it('interpolates the plausible night-stretch band and refuses to guess outside 4-52 weeks', () => {
    assert.deepEqual(longestNightStretchTypical(9), { lo: 180, hi: 390 });
    assert.equal(longestNightStretchTypical(2), null);
    assert.equal(longestNightStretchTypical(80), null);
    assert.equal(longestNightStretchTypical(null), null);
  });

  // What the predictions and the "usual range" line run on must not move.
  it('leaves the prediction inputs exactly as they were', () => {
    assert.deepEqual(totalSleepTarget(1.5), { min: 14 * 60, max: 17 * 60, mid: 15.5 * 60 });
    assert.equal(totalSleepTarget(6).mid, 14 * 60);
    assert.deepEqual(totalSleepTarget(6), { min: 12 * 60, max: 16 * 60, mid: 14 * 60 });
    assert.deepEqual(
      WAKE_WINDOWS_BY_AGE.map((r) => [r.maxWeeks, r.min, r.max]),
      [[4, 30, 60], [8, 45, 75], [12, 60, 90], [16, 75, 120], [24, 105, 150], [36, 150, 210], [52, 180, 240], [78, 240, 360], [Infinity, 300, 420]]
    );
    assert.equal(PROVISIONAL_TUNABLES.phase2MinAgeWeeks, 8);
    assert.equal(PROVISIONAL_TUNABLES.ruptureMadThreshold, 3);
  });
});
