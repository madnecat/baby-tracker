import test from 'node:test';
import assert from 'node:assert/strict';
import {
  describeSides,
  feedInsights,
  lastFinishedFeed,
  observationsText,
  suggestNextSide,
} from './breastfeeding.js';

const NOW = Date.parse('2026-10-03T12:00:00.000Z');
const feed = (details, { startMinAgo = 60, minutes = 10, id = 1 } = {}) => ({
  id,
  type: 'breastfeeding',
  startedAt: new Date(NOW - startMinAgo * 60000).toISOString(),
  endedAt: new Date(NOW - (startMinAgo - minutes) * 60000).toISOString(),
  details,
});

test('suggestNextSide follows the agreed rules', () => {
  assert.equal(suggestNextSide(feed({ side: 'left' }), NOW), 'right');
  assert.equal(suggestNextSide(feed({ side: 'right' }), NOW), 'left');
  // After a feed on both sides the starting side alternates too.
  assert.equal(suggestNextSide(feed({ side: 'both', firstSide: 'left' }), NOW), 'right');
  assert.equal(suggestNextSide(feed({ side: 'both', firstSide: 'right' }), NOW), 'left');
});

test('no suggestion when the last feed was long ago', () => {
  const old = feed({ side: 'left' }, { startMinAgo: 13 * 60 + 10 });
  assert.equal(suggestNextSide(old, NOW), null);
  assert.equal(suggestNextSide(feed({ side: 'left' }, { startMinAgo: 60 }), NOW), 'right');
});

test('no suggestion without enough information', () => {
  assert.equal(suggestNextSide(null, NOW), null);
  assert.equal(suggestNextSide(feed({ side: 'both' }), NOW), null, 'older "both" feeds have no starting side');
  assert.equal(suggestNextSide(feed({ side: 'both', firstSide: 'middle' }), NOW), null);
  assert.equal(suggestNextSide(feed({}), NOW), null);
  assert.equal(suggestNextSide({ ...feed({ side: 'left' }), endedAt: 'garbage' }, NOW), null, 'unparseable end time');
});

test('describeSides', () => {
  assert.equal(describeSides({ side: 'left' }), 'Left');
  assert.equal(describeSides({ side: 'both', firstSide: 'right' }), 'Right, then Left');
  assert.equal(describeSides({ side: 'both' }), 'Both sides');
});

test('lastFinishedFeed picks the newest finished breastfeed regardless of list order', () => {
  const events = [
    feed({ side: 'left' }, { startMinAgo: 300, id: 1 }),
    { ...feed({ side: 'x' }, { startMinAgo: 5, id: 9 }), type: 'bottle' },
    feed({ side: 'right' }, { startMinAgo: 30, id: 2 }),
  ];
  assert.equal(lastFinishedFeed(events, NOW).id, 2);
  assert.equal(lastFinishedFeed([], NOW), null);
});

test('lastFinishedFeed ignores unfinished and future-dated feeds', () => {
  const running = { ...feed({ side: 'left' }, { startMinAgo: 5, id: 7 }), endedAt: null };
  const future = feed({ side: 'left' }, { startMinAgo: -120, id: 8 });
  const real = feed({ side: 'right' }, { startMinAgo: 90, id: 2 });
  assert.equal(lastFinishedFeed([running, future, real], NOW).id, 2);
});

test('observationsText joins tags and the after-feed answer', () => {
  assert.equal(observationsText({ side: 'left' }), null);
  assert.equal(
    observationsText({ tags: ['efficient', 'dozed'], afterFeed: 'satisfied' }),
    'Efficient feed · Fell asleep · Seemed full'
  );
});

test('insights need enough observed feeds, then report plain medians', () => {
  const two = [feed({ tags: ['efficient'] }, { id: 1 }), feed({ tags: ['searching'] }, { id: 2 })];
  assert.equal(feedInsights(two, NOW), null);

  const events = [
    feed({ tags: ['efficient'], afterFeed: 'satisfied' }, { id: 1, minutes: 6 }),
    feed({ tags: ['efficient'], afterFeed: 'satisfied' }, { id: 2, minutes: 10, startMinAgo: 200 }),
    feed({ tags: ['searching'], afterFeed: 'still_hungry' }, { id: 3, minutes: 25, startMinAgo: 400 }),
    feed({ tags: ['searching', 'efficient'] }, { id: 4, minutes: 99, startMinAgo: 600 }),
    feed({ side: 'left' }, { id: 5, minutes: 15, startMinAgo: 800 }),
  ];
  const r = feedInsights(events, NOW);
  assert.equal(r.observedCount, 4);
  assert.equal(r.totalCount, 5);
  assert.deepEqual(
    [r.mix.efficient.count, r.mix.searching.count, r.mix.other.count, r.mix.none.count],
    [2, 1, 1, 1],
    'the feed tagged with both lands in "other notes"; the untagged one in "none"'
  );
  assert.equal(
    r.mix.efficient.count + r.mix.searching.count + r.mix.other.count + r.mix.none.count,
    r.totalCount,
    'every feed is in exactly one bucket'
  );
  assert.deepEqual(r.efficient, { count: 2, medianMinutes: 8 });
  assert.deepEqual(r.searching, { count: 1, medianMinutes: 25 });
  assert.deepEqual(r.afterFeed, { answered: 3, satisfied: 2 });
});

test('insights ignore feeds older than the window and unfinished ones', () => {
  const old = [1, 2, 3].map((i) => feed({ tags: ['efficient'] }, { id: i, startMinAgo: 20 * 24 * 60 }));
  assert.equal(feedInsights(old, NOW), null);
  const running = [1, 2, 3].map((i) => ({ ...feed({ tags: ['efficient'] }, { id: i }), endedAt: null }));
  assert.equal(feedInsights(running, NOW), null);
});

test('no card when no notes were ever given (e.g. the question was turned off)', () => {
  // Plenty of plain feeds (one-side, both-sides, even an empty tags list), none with a note.
  const plain = Array.from({ length: 30 }, (_, i) =>
    feed(i % 3 === 0 ? { side: 'left' } : i % 3 === 1 ? { side: 'both', firstSide: 'right' } : { side: 'right', tags: [] }, {
      id: i + 1,
      startMinAgo: 60 + i * 180,
    })
  );
  assert.equal(feedInsights(plain, NOW), null);
});
