import test from 'node:test';
import assert from 'node:assert/strict';
import { planThaw, URGENT_DAYS, SOON_DAYS, WEIGHTS } from './freezerPlanner.js';
import { addMonths, daysBetween, isValidDate, todayInHousehold, hourInHousehold } from './freezerDates.js';

const TODAY = '2026-10-25';
const inDays = (n) => {
  const d = new Date(Date.UTC(2026, 9, 25 + n));
  return d.toISOString().slice(0, 10);
};
let nextId = 1;
const bag = (quantityMl, days, extra = {}) => {
  const id = extra.id ?? nextId++;
  return { id, reference: extra.reference ?? id, quantityMl, expiresOn: inDays(days) };
};
const ids = (option) => option.bagIds.slice().sort((a, b) => a - b);

test('the example: 50 + 30 expiring tomorrow and a fresh 60, 110 ml wanted -> all three bags', () => {
  const a = bag(50, 1, { id: 1 });
  const b = bag(30, 1, { id: 2 });
  const c = bag(60, 100, { id: 3 });
  const plan = planThaw([a, b, c], 110, TODAY);
  assert.equal(plan.enough, true);
  assert.deepEqual(ids(plan.options[0]), [1, 2, 3]);
  assert.equal(plan.options[0].totalMl, 140);
  assert.equal(plan.options[0].overshootMl, 30);
  assert.deepEqual(plan.options[0].leavesUrgent, []);
});

test('with nothing urgent, the exact total wins over a bigger one', () => {
  const plan = planThaw([bag(50, 60, { id: 1 }), bag(60, 60, { id: 2 }), bag(30, 60, { id: 3 })], 110, TODAY);
  assert.deepEqual(ids(plan.options[0]), [1, 2]);
  assert.equal(plan.options[0].overshootMl, 0);
});

test('older bags are preferred when totals tie', () => {
  const older = bag(50, 20, { id: 1 });
  const newer = bag(50, 90, { id: 2 });
  const plan = planThaw([newer, older], 50, TODAY);
  assert.deepEqual(plan.options[0].bagIds, [1]);
});

test('fewer bags are preferred when totals tie', () => {
  const plan = planThaw(
    [bag(100, 60, { id: 1 }), bag(50, 60, { id: 2 }), bag(50, 60, { id: 3 })],
    100,
    TODAY
  );
  assert.deepEqual(plan.options[0].bagIds, [1]);
});

test('an urgent bag is used even if it overshoots the target', () => {
  const plan = planThaw([bag(120, 1, { id: 1 }), bag(60, 90, { id: 2 })], 60, TODAY);
  assert.deepEqual(plan.options[0].bagIds, [1]);
  assert.equal(plan.options[0].overshootMl, 60);
});

test('urgent bags left behind are reported', () => {
  // Three urgent 100 ml bags, only 100 ml wanted: one is used, two are flagged as at risk.
  const plan = planThaw([bag(100, 1, { id: 1 }), bag(100, 2, { id: 2 }), bag(100, 3, { id: 3 })], 100, TODAY);
  assert.equal(plan.options[0].bagIds.length, 1);
  assert.equal(plan.options[0].leavesUrgent.length, 2);
  for (const b of plan.options[0].leavesUrgent) assert.ok(b.daysLeft <= URGENT_DAYS);
});

test('the bag expiring soonest goes first among equal urgent bags', () => {
  const plan = planThaw([bag(100, 3, { id: 1 }), bag(100, 1, { id: 2 })], 100, TODAY);
  assert.deepEqual(plan.options[0].bagIds, [2]);
});

test('a bag expiring today is still offered; one that expired yesterday never is', () => {
  const plan = planThaw([bag(50, 0, { id: 1 }), bag(50, -1, { id: 2 })], 50, TODAY);
  assert.deepEqual(plan.options[0].bagIds, [1]);
  assert.deepEqual(plan.expiredSkipped.map((b) => b.id), [2]);
});

test('not enough stock: one option with everything usable, enough=false', () => {
  const plan = planThaw([bag(30, 10, { id: 1 }), bag(40, 10, { id: 2 })], 200, TODAY);
  assert.equal(plan.enough, false);
  assert.deepEqual(ids(plan.options[0]), [1, 2]);
  assert.equal(plan.options[0].totalMl, 70);
  assert.equal(plan.options[0].overshootMl, -130);
});

test('empty stock and stock that is all expired give no options', () => {
  assert.deepEqual(planThaw([], 100, TODAY).options, []);
  const onlyExpired = planThaw([bag(50, -5, { id: 1 })], 50, TODAY);
  assert.equal(onlyExpired.enough, false);
  assert.deepEqual(onlyExpired.options, []);
});

test('invalid targets are rejected', () => {
  for (const bad of [0, -10, 1.5, NaN, '100', null, 5000]) {
    assert.throws(() => planThaw([bag(50, 10)], bad, TODAY), RangeError);
  }
});

test('alternatives use different bags and never repeat a set', () => {
  const stock = [
    bag(50, 40, { id: 1 }),
    bag(50, 41, { id: 2 }),
    bag(50, 42, { id: 3 }),
    bag(60, 43, { id: 4 }),
    bag(30, 44, { id: 5 }),
  ];
  const plan = planThaw(stock, 110, TODAY);
  assert.ok(plan.options.length >= 2 && plan.options.length <= 3);
  const keys = plan.options.map((o) => ids(o).join(','));
  assert.equal(new Set(keys).size, keys.length);
  for (const o of plan.options) assert.ok(o.totalMl >= 110);
});

test('equal-quantity duplicates give a stable, id-ordered choice', () => {
  const stock = [bag(50, 30, { id: 3 }), bag(50, 30, { id: 1 }), bag(50, 30, { id: 2 })];
  const first = planThaw(stock, 50, TODAY).options[0].bagIds;
  const second = planThaw(stock.slice().reverse(), 50, TODAY).options[0].bagIds;
  assert.deepEqual(first, second);
});

test('does not mutate its input', () => {
  const stock = [bag(50, 3, { id: 1 }), bag(60, 90, { id: 2 })];
  const copy = JSON.parse(JSON.stringify(stock));
  planThaw(stock, 60, TODAY);
  assert.deepEqual(stock, copy);
});

// ---- brute force comparison -------------------------------------------------------------------

// Same cost model written independently and naively (enumerate every subset).
function bruteForceBest(bags, target, today) {
  const items = bags
    .map((b) => ({ ...b, d: daysBetween(today, b.expiresOn) }))
    .filter((b) => b.d >= 0);
  let best = null;
  for (let mask = 1; mask < 1 << items.length; mask += 1) {
    let total = 0;
    let cost = 0;
    items.forEach((b, i) => {
      const chosen = (mask >> i) & 1;
      const waste = b.d <= URGENT_DAYS ? WEIGHTS.urgentWastePerMl : b.d <= SOON_DAYS ? WEIGHTS.soonWastePerMl : 0;
      if (chosen) {
        total += b.quantityMl;
        cost += WEIGHTS.perBag + WEIGHTS.freshnessPerDay * Math.min(b.d, WEIGHTS.freshnessDaysCap);
      } else {
        cost += waste * b.quantityMl;
      }
    });
    if (total < target) continue;
    const over = total - target;
    cost += WEIGHTS.overshootPerMl * over + WEIGHTS.largeOvershootExtraPerMl * Math.max(0, over - WEIGHTS.largeOvershootMl);
    if (best === null || cost < best.cost) best = { cost, total };
  }
  return best;
}

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

test('matches an exhaustive search on 300 random stocks (same optimal cost)', () => {
  const rand = seededRandom(42);
  for (let round = 0; round < 300; round += 1) {
    const count = 1 + Math.floor(rand() * 9);
    const stock = Array.from({ length: count }, (_, i) =>
      bag(10 * (1 + Math.floor(rand() * 12)), Math.floor(rand() * 130) - 3, { id: i + 1 })
    );
    const target = 10 * (1 + Math.floor(rand() * 15));
    const expected = bruteForceBest(stock, target, TODAY);
    const plan = planThaw(stock, target, TODAY);
    if (!expected) {
      assert.equal(plan.enough, false, `round ${round}: should be insufficient`);
      continue;
    }
    assert.equal(plan.enough, true, `round ${round}: should be enough`);
    const o = plan.options[0];
    // Recompute the cost of the chosen set independently and compare with the optimum.
    const chosen = new Set(o.bagIds);
    let cost = 0;
    for (const b of stock) {
      const d = daysBetween(TODAY, b.expiresOn);
      if (d < 0) continue;
      if (chosen.has(b.id)) cost += WEIGHTS.perBag + WEIGHTS.freshnessPerDay * Math.min(d, WEIGHTS.freshnessDaysCap);
      else cost += (d <= URGENT_DAYS ? WEIGHTS.urgentWastePerMl : d <= SOON_DAYS ? WEIGHTS.soonWastePerMl : 0) * b.quantityMl;
    }
    const over = o.totalMl - target;
    cost += WEIGHTS.overshootPerMl * over + WEIGHTS.largeOvershootExtraPerMl * Math.max(0, over - WEIGHTS.largeOvershootMl);
    assert.equal(cost, expected.cost, `round ${round}: stock ${JSON.stringify(stock)} target ${target}`);
    assert.ok(o.totalMl >= target);
  }
});

test('invariants on random stocks: totals add up, no expired or repeated bags, alternatives distinct', () => {
  const rand = seededRandom(7);
  for (let round = 0; round < 200; round += 1) {
    const count = Math.floor(rand() * 14);
    const stock = Array.from({ length: count }, (_, i) =>
      bag(5 * (1 + Math.floor(rand() * 40)), Math.floor(rand() * 140) - 10, { id: i + 1 })
    );
    const target = 5 * (1 + Math.floor(rand() * 50));
    const plan = planThaw(stock, target, TODAY);
    const keys = new Set();
    for (const o of plan.options) {
      assert.equal(new Set(o.bagIds).size, o.bagIds.length, 'no bag twice');
      assert.equal(o.totalMl, o.bags.reduce((n, b) => n + b.quantityMl, 0));
      assert.equal(o.overshootMl, o.totalMl - target);
      for (const b of o.bags) assert.ok(b.daysLeft >= 0, 'never offers an expired bag');
      const key = ids(o).join(',');
      assert.ok(!keys.has(key), 'alternatives are distinct');
      keys.add(key);
      if (plan.enough) assert.ok(o.totalMl >= target);
    }
  }
});

test('a big stock (150 bags) is planned quickly', () => {
  const rand = seededRandom(99);
  const stock = Array.from({ length: 150 }, (_, i) =>
    bag(20 + Math.floor(rand() * 15) * 10, Math.floor(rand() * 120), { id: i + 1 })
  );
  const started = Date.now();
  const plan = planThaw(stock, 120, TODAY);
  assert.equal(plan.enough, true);
  assert.ok(Date.now() - started < 3000, 'planning stays fast');
});

// ---- dates ------------------------------------------------------------------------------------

test('addMonths clamps to the end of shorter months', () => {
  assert.equal(addMonths('2026-10-31', 4), '2027-02-28');
  assert.equal(addMonths('2027-10-31', 4), '2028-02-29'); // leap year
  assert.equal(addMonths('2026-10-30', 4), '2027-02-28');
  assert.equal(addMonths('2026-10-25', 4), '2027-02-25');
  assert.equal(addMonths('2026-09-30', 4), '2027-01-30');
  assert.equal(addMonths('2026-12-15', 4), '2027-04-15');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2024-02-29', 12), '2025-02-28');
});

test('isValidDate rejects impossible and malformed dates', () => {
  assert.equal(isValidDate('2026-02-28'), true);
  assert.equal(isValidDate('2024-02-29'), true);
  for (const bad of ['2026-02-30', '2026-13-01', '2026-1-1', '26-01-01', '', null, undefined, 20260101, '2026-01-01T00:00:00Z']) {
    assert.equal(isValidDate(bad), false, String(bad));
  }
});

test('daysBetween counts whole calendar days, across DST changes and years', () => {
  assert.equal(daysBetween('2026-10-25', '2026-11-01'), 7);
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2); // UK clocks go forward on 29 March 2026
  assert.equal(daysBetween('2026-12-30', '2027-01-02'), 3);
  assert.equal(daysBetween('2026-10-25', '2026-10-24'), -1);
});

test('todayInHousehold / hourInHousehold use London time, not UTC', () => {
  // 23:30 UTC on 28 March 2026 is still 28 March in London (GMT); 23:30 UTC on 29 June is already 30 June (BST).
  assert.equal(todayInHousehold(new Date('2026-03-28T23:30:00Z')), '2026-03-28');
  assert.equal(todayInHousehold(new Date('2026-06-29T23:30:00Z')), '2026-06-30');
  assert.equal(hourInHousehold(new Date('2026-06-29T23:30:00Z')), 0);
  assert.equal(hourInHousehold(new Date('2026-12-01T07:00:00Z')), 7);
  assert.equal(hourInHousehold(new Date('2026-07-01T06:00:00Z')), 7);
});
