import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { activeMs, isPaused, pausedMs, stopPatch, withPause, withResume } from './feedPauses.js';

const at = (m) => new Date(Date.UTC(2026, 9, 27, 10, m)).toISOString();
const feed = (extra = {}) => ({ startedAt: at(0), endedAt: null, details: { side: 'left' }, ...extra });

describe('feed pauses', () => {
  it('pausing and resuming records one pause', () => {
    const paused = withPause({ side: 'left' }, new Date(at(10)));
    assert.equal(isPaused(feed({ details: paused })), true);
    const resumed = withResume(paused, new Date(at(15)));
    assert.deepEqual(resumed.pauses, [{ from: at(10), to: at(15) }]);
    assert.equal(isPaused(feed({ details: resumed })), false);
  });

  it('pausing twice or resuming without a pause changes nothing', () => {
    const paused = withPause({}, new Date(at(10)));
    assert.equal(withPause(paused, new Date(at(11))), paused);
    const plain = { side: 'left' };
    assert.equal(withResume(plain, new Date(at(11))), plain);
  });

  it('active time leaves the pauses out', () => {
    const e = feed({
      endedAt: at(30),
      details: { pauses: [{ from: at(10), to: at(15) }, { from: at(20), to: at(22) }] },
    });
    assert.equal(pausedMs(e), 7 * 60000);
    assert.equal(activeMs(e), 23 * 60000);
  });

  it('a running paused feed stops counting at the pause', () => {
    const e = feed({ details: { pauses: [{ from: at(10), to: null }] } });
    assert.equal(activeMs(e, Date.parse(at(40))), 10 * 60000);
  });

  it('pauses outside the feed (after an edit) are clamped, garbage is ignored', () => {
    const e = feed({
      endedAt: at(20),
      details: { pauses: [{ from: at(15), to: at(40) }, { from: 'nope', to: null }, { from: at(5), to: at(2) }] },
    });
    assert.equal(activeMs(e), 15 * 60000);
  });

  it('stopping while paused ends the feed at the pause and drops that pause', () => {
    const e = feed({ details: { side: 'left', pauses: [{ from: at(3), to: at(5) }, { from: at(12), to: null }] } });
    const patch = stopPatch(e, new Date(at(60)));
    assert.equal(patch.endedAt, at(12));
    assert.deepEqual(patch.details.pauses, [{ from: at(3), to: at(5) }]);
  });

  it('stopping a running feed ends it now and leaves details alone', () => {
    assert.deepEqual(stopPatch(feed(), new Date(at(9))), { endedAt: at(9) });
  });
});
