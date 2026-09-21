const DAY_MS = 86400000;

// A 4-minute sleep is ~5px wide on a phone. Taps snap to any sleep block within this many px, so a
// fingertip (~40px) can still land on the thin ones.
export const MIN_HIT_PX = 32;

/**
 * The sleep blocks inside [from, now], clipped to the window for drawing. `fullStart` keeps the
 * real start so the detail can say when a sleep that began before the window really began.
 */
export function sleepBlocks(intervals, from, now) {
  return intervals
    .filter((s) => !s.suspect && s.effectiveEnd > from && s.start < now)
    .map((s) => ({
      start: Math.max(s.start, from),
      end: Math.min(s.effectiveEnd, now),
      fullStart: s.start,
      open: s.open,
    }));
}

/**
 * Index of the sleep block a tap at `x` px lands on, on a band `width` px wide covering
 * [from, from + 24h], or null. Blocks thinner than MIN_HIT_PX get a padded hit zone; when zones
 * overlap, the block whose centre is nearest wins.
 */
export function blockAt(blocks, x, width, from) {
  const px = (t) => ((t - from) / DAY_MS) * width;
  let best = null;
  let bestDistance = Infinity;
  blocks.forEach((block, index) => {
    const left = px(block.start);
    const right = px(block.end);
    const pad = Math.max(0, MIN_HIT_PX - (right - left)) / 2;
    if (x < left - pad || x > right + pad) return;
    const distance = Math.abs(x - (left + right) / 2);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}
