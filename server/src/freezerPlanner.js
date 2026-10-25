import { daysBetween } from './freezerDates.js';

// Picks which freezer bags to thaw for a bottle. A thawed bag can't go back in the freezer, so
// whole bags are chosen and the target is a minimum: a bit of extra milk is fine, a bag lost to its
// expiry date is not.
//
// Cost of a choice S (lower is better), all integers so ties are exact and results are stable:
//   overshoot(total - target)  + bags in S + freshness of the bags in S - waste of the bags NOT in S
// The waste term is what makes "50 ml + 30 ml expiring tomorrow, 60 ml fresh, 110 ml wanted" return
// all three bags (140 ml) rather than 50 + 60 and letting the 30 ml expire.

/** A bag that expires within this many days is "urgent": leaving it behind is very costly. */
export const URGENT_DAYS = 3;
/** A bag that expires within this many days is "soon": leaving it behind costs a little. */
export const SOON_DAYS = 7;
export const MAX_TARGET_ML = 2000;
const MAX_ALTERNATIVES = 3;

// Thawing milk nobody will drink wastes it just as surely as letting it expire, so rescuing an
// urgent bag only pays while the extra milk stays plausible to use: the waste saved per ml is
// larger than the cost of a small overshoot, but a big overshoot (past LARGE_OVERSHOOT_ML) costs
// more than it saves.
export const WEIGHTS = {
  overshootPerMl: 30,
  largeOvershootMl: 60,
  largeOvershootExtraPerMl: 150,
  perBag: 800,
  freshnessPerDay: 5,
  freshnessDaysCap: 130,
  urgentWastePerMl: 80,
  soonWastePerMl: 25,
};
const W = WEIGHTS;

function overshootCost(over) {
  return W.overshootPerMl * over + W.largeOvershootExtraPerMl * Math.max(0, over - W.largeOvershootMl);
}

function wastePerMl(daysLeft) {
  if (daysLeft <= URGENT_DAYS) return W.urgentWastePerMl;
  if (daysLeft <= SOON_DAYS) return W.soonWastePerMl;
  return 0;
}

/**
 * Best bag set for `targetMl`, excluding the bags in `banned`. Exact: a 0/1 knapsack over the
 * total millilitres (the cost is a function of the total plus a sum over the chosen bags, so
 * nothing needs enumerating). Returns null when no set reaches the target.
 */
function bestSet(items, targetMl, banned) {
  const usable = items.filter((b) => !banned.has(b.id));
  const sum = usable.reduce((n, b) => n + b.quantityMl, 0);
  if (sum < targetMl) return null;

  const INF = Infinity;
  // bagCost = what choosing the bag adds, net of the waste it avoids (can be negative).
  const best = new Array(sum + 1).fill(INF);
  best[0] = 0;
  const took = usable.map(() => new Uint8Array(sum + 1));
  let reachable = 0;
  usable.forEach((bag, i) => {
    const bagCost = W.perBag + W.freshnessPerDay * Math.min(bag.daysLeft, W.freshnessDaysCap) - wastePerMl(bag.daysLeft) * bag.quantityMl;
    for (let t = reachable; t >= 0; t -= 1) {
      if (best[t] === INF) continue;
      const next = t + bag.quantityMl;
      const cost = best[t] + bagCost;
      if (cost < best[next]) {
        best[next] = cost;
        took[i][next] = 1;
      }
    }
    reachable += bag.quantityMl;
  });

  let bestTotal = -1;
  let bestCost = INF;
  for (let t = targetMl; t <= sum; t += 1) {
    if (best[t] === INF) continue;
    const cost = best[t] + overshootCost(t - targetMl);
    if (cost < bestCost) {
      bestCost = cost;
      bestTotal = t;
    }
  }
  if (bestTotal < 0) return null;

  // Walk back through the table. `took[i][t]` records the LAST write to best[t], which is the one
  // that produced the value kept, so the path is consistent.
  const chosen = [];
  let t = bestTotal;
  for (let i = usable.length - 1; i >= 0; i -= 1) {
    if (took[i][t]) {
      chosen.push(usable[i]);
      t -= usable[i].quantityMl;
    }
  }
  return { bags: chosen.reverse(), totalMl: bestTotal, cost: bestCost };
}

function describe(set, items, targetMl) {
  const chosenIds = new Set(set.bags.map((b) => b.id));
  return {
    bags: set.bags.map(publicBag),
    bagIds: set.bags.map((b) => b.id),
    totalMl: set.totalMl,
    overshootMl: set.totalMl - targetMl,
    // Urgent bags this choice leaves behind: they will probably expire before the next thaw.
    leavesUrgent: items.filter((b) => !chosenIds.has(b.id) && b.daysLeft <= URGENT_DAYS).map(publicBag),
    cost: set.cost,
  };
}

function publicBag(b) {
  return {
    id: b.id,
    reference: b.reference,
    quantityMl: b.quantityMl,
    expiresOn: b.expiresOn,
    daysLeft: b.daysLeft,
  };
}

/**
 * Suggests bags for a bottle of `targetMl`.
 *
 * `bags` are `{ id, reference, quantityMl, expiresOn }` (any status is the caller's business; bags
 * already past `expiresOn` are never offered). Returns:
 *   { targetMl, enough, options: [{ bags, bagIds, totalMl, overshootMl, leavesUrgent }...], expiredSkipped }
 * `options[0]` is the recommendation; the others use different bags (each is the best set that
 * avoids one bag of the recommendation). When the stock can't reach the target, `enough` is false
 * and the single option is every usable bag.
 */
export function planThaw(bags, targetMl, today) {
  if (!Number.isInteger(targetMl) || targetMl <= 0 || targetMl > MAX_TARGET_ML) {
    throw new RangeError(`targetMl must be a whole number between 1 and ${MAX_TARGET_ML}`);
  }
  const all = bags.map((b) => ({ ...b, daysLeft: daysBetween(today, b.expiresOn) }));
  const expiredSkipped = all.filter((b) => b.daysLeft < 0).map(publicBag);
  // Sorted by id so equal-cost choices always resolve the same way.
  const items = all.filter((b) => b.daysLeft >= 0).sort((a, b) => a.id - b.id);

  const first = bestSet(items, targetMl, new Set());
  if (!first) {
    const totalMl = items.reduce((n, b) => n + b.quantityMl, 0);
    if (items.length === 0) return { targetMl, enough: false, options: [], expiredSkipped };
    const everything = { bags: items, totalMl, cost: 0 };
    return { targetMl, enough: false, options: [describe(everything, items, targetMl)], expiredSkipped };
  }

  const options = [describe(first, items, targetMl)];
  const seen = new Set([options[0].bagIds.join(',')]);
  const candidates = [];
  for (const bag of first.bags) {
    const alternative = bestSet(items, targetMl, new Set([bag.id]));
    if (!alternative) continue;
    const described = describe(alternative, items, targetMl);
    const key = described.bagIds.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(described);
  }
  candidates.sort((a, b) => a.cost - b.cost || a.bagIds.join(',').localeCompare(b.bagIds.join(',')));
  options.push(...candidates.slice(0, MAX_ALTERNATIVES - 1));
  return {
    targetMl,
    enough: true,
    options: options.map(({ cost, ...rest }) => rest),
    expiredSkipped,
  };
}
