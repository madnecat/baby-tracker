/**
 * Tests for the 24h sleep band's blocks and tap hit-testing. Run with `npm test` from web/.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeSleeps } from './sleep.js';
import { blockAt, sleepBlocks } from './sleepBand.js';

const MINUTE = 60000;
const HOUR = 3600000;
const DAY = 86400000;
const NOW = new Date(2026, 5, 15, 14, 30, 0).getTime();
const FROM = NOW - DAY;
const WIDTH = 1000; // px

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

const px = (t) => ((t - FROM) / DAY) * WIDTH;

describe('sleepBlocks', () => {
  it('clips a sleep that began before the window but remembers when it really began', () => {
    const { intervals } = normalizeSleeps([sleepEvent(FROM - 3 * HOUR, FROM + 5 * HOUR)], NOW);
    const [block] = sleepBlocks(intervals, FROM, NOW);
    assert.equal(block.start, FROM);
    assert.equal(block.fullStart, FROM - 3 * HOUR);
  });

  it('leaves out a forgotten timer instead of painting it as sleep', () => {
    const { intervals } = normalizeSleeps([sleepEvent(NOW - 9 * HOUR, null)], NOW);
    assert.equal(sleepBlocks(intervals, FROM, NOW).length, 0);
  });
});

describe('blockAt', () => {
  const { intervals } = normalizeSleeps(
    [
      sleepEvent(NOW - 12 * HOUR, NOW - 6 * HOUR), // wide block
      sleepEvent(NOW - 4 * HOUR, NOW - 4 * HOUR + 5 * MINUTE), // thin: ~3.5px at 1000px wide
    ],
    NOW
  );
  const blocks = sleepBlocks(intervals, FROM, NOW);

  it('picks the wide block when tapped inside it', () => {
    assert.equal(blockAt(blocks, px(NOW - 9 * HOUR), WIDTH, FROM), 0);
  });

  it('picks nothing when tapped well away from any sleep', () => {
    assert.equal(blockAt(blocks, px(NOW - 2 * HOUR), WIDTH, FROM), null);
  });

  it('snaps a tap a fingertip away from a thin sleep onto that sleep', () => {
    const centre = px(NOW - 4 * HOUR + 2.5 * MINUTE);
    for (const offset of [-12, 0, 12]) {
      assert.equal(blockAt(blocks, centre + offset, WIDTH, FROM), 1, `offset ${offset}px`);
    }
    assert.equal(blockAt(blocks, centre + 40, WIDTH, FROM), null);
  });
});
