import { withLocale } from '../i18n/testSetup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonths,
  daysLeftText,
  formatCalendarDate,
  listReferences,
  localToday,
  readWholeMl,
  summarize,
  urgencyOf,
} from './freezer.js';

test('addMonths clamps to the end of shorter months (same rules as the server)', () => {
  assert.equal(addMonths('2026-10-31', 4), '2027-02-28');
  assert.equal(addMonths('2027-10-31', 4), '2028-02-29');
  assert.equal(addMonths('2026-10-25', 4), '2027-02-25');
  assert.equal(addMonths('2026-12-15', 4), '2027-04-15');
  assert.equal(addMonths('2026-09-30', 4), '2027-01-30');
});

test('localToday is the device calendar date, zero padded', () => {
  assert.equal(localToday(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(localToday(new Date(2026, 10, 25, 0, 1)), '2026-11-25');
});

test('summarize: count, total volume and the soonest expiry', () => {
  assert.deepEqual(summarize([]), { count: 0, totalMl: 0, nextExpiryOn: null });
  assert.deepEqual(
    summarize([
      { quantityMl: 50, expiresOn: '2027-01-01' },
      { quantityMl: 30, expiresOn: '2026-11-02' },
      { quantityMl: 70, expiresOn: '2026-12-31' },
    ]),
    { count: 3, totalMl: 150, nextExpiryOn: '2026-11-02' }
  );
});

test('urgencyOf: 3 days or fewer is urgent, 7 or fewer is soon', () => {
  assert.equal(urgencyOf(0), 'urgent');
  assert.equal(urgencyOf(3), 'urgent');
  assert.equal(urgencyOf(4), 'soon');
  assert.equal(urgencyOf(7), 'soon');
  assert.equal(urgencyOf(8), 'ok');
});

test('readWholeMl accepts whole positive numbers only', () => {
  assert.equal(readWholeMl('50'), 50);
  assert.equal(readWholeMl(' 120 '), 120);
  for (const bad of ['', '0', '-5', '5.5', '5,5', 'abc', '1e3', null, undefined]) {
    assert.equal(readWholeMl(bad), null, String(bad));
  }
  assert.equal(readWholeMl('500', 500), 500);
  assert.equal(readWholeMl('501', 500), null);
});

test('texts follow the language: dates, day counts and bag numbers', () => {
  withLocale('en', () => {
    assert.equal(formatCalendarDate('2026-10-25'), '25 Oct 2026');
    assert.equal(daysLeftText(1), '1 day left');
    assert.equal(daysLeftText(12), '12 days left');
    assert.equal(daysLeftText(0), 'last day today');
    assert.equal(daysLeftText(-2), 'last day today');
    assert.equal(listReferences([5, 1]), '1 and 5');
    assert.equal(listReferences([9, 1, 5]), '1, 5 and 9');
    assert.equal(listReferences([7]), '7');
  });
  withLocale('fr', () => {
    assert.match(formatCalendarDate('2026-10-25'), /^25 oct\.? 2026$/);
    assert.equal(daysLeftText(1), '1 jour restant');
    assert.equal(daysLeftText(12), '12 jours restants');
    assert.equal(listReferences([5, 1]), '1 et 5');
    assert.equal(listReferences([9, 1, 5]), '1, 5 et 9');
  });
});

test('formatCalendarDate shows the date as written, whatever the time zone, and refuses junk', () => {
  withLocale('en', () => {
    assert.equal(formatCalendarDate('2026-03-29'), '29 Mar 2026');
    assert.equal(formatCalendarDate('2026-12-31'), '31 Dec 2026');
    assert.equal(formatCalendarDate(''), '');
    assert.equal(formatCalendarDate(null), '');
    assert.equal(formatCalendarDate('2026-10-25T10:00:00Z'), '');
  });
});
