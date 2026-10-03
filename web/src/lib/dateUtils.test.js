import { withLocale } from '../i18n/testSetup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatAgo,
  formatClock,
  formatDateOnly,
  formatDateTime,
  formatDuration,
  formatDurationMs,
  formatMinutes,
  formatMoment,
} from './dateUtils.js';
import { EVENT_COLORS, FEED_NOTE_COLORS, eventTypeLabel, percentileLabel } from './palette.js';

// whoPercentiles.js imports JSON tables (not loadable under bare node); same ids as its bands.
const PERCENTILE_BANDS = ['3rd', '15th', '50th', '85th', '97th'].map((label) => ({ label }));
import { CONSISTENCY_OPTIONS } from './diaperOptions.js';

const NBSP = ' ';
const T0 = '2026-10-03T14:30:00';

test('formatDuration: timer style in both languages', () => {
  const start = '2026-10-03T10:00:00';
  assert.equal(formatDuration(start, '2026-10-03T11:05:09'), '1h 05m');
  assert.equal(formatDuration(start, '2026-10-03T10:05:03'), '5m 03s');
  withLocale('fr', () => {
    assert.equal(formatDuration(start, '2026-10-03T11:05:09'), `1${NBSP}h 05${NBSP}min`);
    assert.equal(formatDuration(start, '2026-10-03T10:05:03'), `5${NBSP}min 03${NBSP}s`);
  });
});

test('formatMinutes and formatDurationMs', () => {
  assert.equal(formatMinutes(65), '1h 05m');
  assert.equal(formatMinutes(125, { pad: false }), '2h 5m');
  assert.equal(formatMinutes(5), '5m');
  assert.equal(formatDurationMs(45000), '45s');
  assert.equal(formatDurationMs(150000), '2m 30s');
  assert.equal(formatDurationMs(12 * 60000), '12m');
  assert.equal(formatDurationMs(3600000), '1h');
  assert.equal(formatDurationMs(3900000), '1h 5m');
  withLocale('fr', () => {
    assert.equal(formatMinutes(65), `1${NBSP}h 05${NBSP}min`);
    assert.equal(formatDurationMs(3600000), `1${NBSP}h`);
    assert.equal(formatDurationMs(45000), `45${NBSP}s`);
  });
});

test('formatAgo', () => {
  const now = Date.parse(T0);
  assert.equal(formatAgo(now - 12 * 60000, now), '12m ago');
  assert.equal(formatAgo(now + 5000, now), '0m ago');
  withLocale('fr', () => assert.equal(formatAgo(now - 65 * 60000, now), `il y a 1${NBSP}h 05${NBSP}min`));
});

test('clock and dates follow the app language, 24 h', () => {
  assert.equal(formatClock(T0), '14:30');
  assert.equal(formatClock('2026-10-03T02:05:00'), '02:05');
  assert.equal(formatDateTime(T0), 'Sat 3 Oct, 14:30');
  assert.equal(formatDateOnly(T0), 'Sat 3 Oct 2026');
  withLocale('fr', () => {
    assert.equal(formatClock(T0), '14:30');
    assert.match(formatDateTime(T0), /^sam\. 3 oct\., 14:30$/);
    assert.match(formatDateOnly(T0), /^sam\. 3 oct\. 2026$/);
  });
});

test('formatMoment adds Yesterday only on another day', () => {
  const now = Date.parse('2026-10-03T18:00:00');
  assert.equal(formatMoment('2026-10-03T09:00:00', now), '09:00');
  assert.equal(formatMoment('2026-10-02T23:10:00', now), 'Yesterday 23:10');
  withLocale('fr', () => assert.equal(formatMoment('2026-10-02T23:10:00', now), 'Hier 23:10'));
});

test('event type, percentile and consistency labels; unknown values fall back to the raw value', () => {
  assert.equal(eventTypeLabel('diaper'), 'Diaper');
  assert.equal(eventTypeLabel('mystery'), 'mystery');
  assert.equal(EVENT_COLORS.sleep.labelKey, 'events.type.sleep');
  assert.equal(EVENT_COLORS.sleep.label, 'Sleep');
  assert.equal(FEED_NOTE_COLORS.full.label, 'Seemed full');
  assert.equal(percentileLabel('3rd'), '3rd');
  assert.deepEqual(PERCENTILE_BANDS.map((b) => b.label), ['3rd', '15th', '50th', '85th', '97th']);
  withLocale('fr', () => {
    assert.equal(eventTypeLabel('diaper'), 'Couche');
    assert.equal(eventTypeLabel('mystery'), 'mystery');
    assert.equal(EVENT_COLORS.sleep.label, 'Sommeil');
    assert.deepEqual(PERCENTILE_BANDS.map((b) => percentileLabel(b.label)), ['3e', '15e', '50e', '85e', '97e']);
    assert.equal(percentileLabel('99th'), '99th');
    assert.equal(CONSISTENCY_OPTIONS.find((c) => c.key === 'hard').label, 'Dur');
  });
  assert.equal(CONSISTENCY_OPTIONS.find((c) => c.key === 'hard').label, 'Hard');
});
