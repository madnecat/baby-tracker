/** Tests for the timeline geometry. Run with `npm test` from web/. Synthetic times only. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { blockAtSpan, timelineRows, timelineTicks } from './sleepTimeline.js';

const HOUR = 3600000;
const DAY = 24 * HOUR;
const NOW = new Date(2026, 5, 20, 15, 30).getTime(); // mid-June: no DST change nearby

describe('timelineRows', () => {
  it('draws one rolling band for 24 hours', () => {
    const rows = timelineRows(NOW, 1);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].from, NOW - DAY);
    assert.equal(rows[0].to, NOW);
    assert.equal(rows[0].span, DAY);
  });

  it('draws two rows for 48 hours: yesterday, then today up to now', () => {
    const rows = timelineRows(NOW, 2);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].from, new Date(2026, 5, 19).getTime());
    assert.equal(rows[0].to, new Date(2026, 5, 20).getTime());
    assert.equal(rows[1].from, new Date(2026, 5, 20).getTime());
    assert.equal(rows[1].to, NOW);
  });

  it('draws one row per local day beyond that, oldest first, today cut at now', () => {
    const rows = timelineRows(NOW, 7);
    assert.equal(rows.length, 7);
    assert.equal(rows[6].from, new Date(2026, 5, 20).getTime());
    assert.equal(rows[6].to, NOW);
    assert.equal(rows[0].from, new Date(2026, 5, 14).getTime());
    assert.equal(rows[0].to, rows[0].from + DAY);
    assert.ok(rows.every((r) => r.span === DAY));
  });
});

describe('timelineTicks', () => {
  it('puts whole-hour ticks inside the band, with their position in percent', () => {
    const from = new Date(2026, 5, 19, 15, 30).getTime();
    const ticks = timelineTicks(from, DAY, 6);
    assert.deepEqual(
      ticks.map((x) => new Date(x.t).getHours()),
      [21, 3, 9, 15]
    );
    assert.equal(Math.round(ticks[0].left * 100) / 100, 22.92);
  });
});

describe('blockAtSpan', () => {
  it('finds a block on a 48-hour band and snaps a tap to a thin one', () => {
    const from = 0;
    const span = 2 * DAY;
    const blocks = [
      { start: 2 * HOUR, end: 10 * HOUR },
      { start: 30 * HOUR, end: 30 * HOUR + 5 * 60000 }, // 5 minutes: ~2px wide on 400px
    ];
    assert.equal(blockAtSpan(blocks, (6 / 48) * 400, 400, from, span), 0);
    assert.equal(blockAtSpan(blocks, (30 / 48) * 400 + 8, 400, from, span), 1);
    assert.equal(blockAtSpan(blocks, (20 / 48) * 400, 400, from, span), null);
  });
});
