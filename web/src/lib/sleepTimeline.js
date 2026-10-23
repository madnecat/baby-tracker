/**
 * Geometry for the sleep timeline on the Charts page, which follows the range selected at the top.
 * Pure functions, no React: `now` is always a parameter.
 *
 * - 24 hours: one continuous band ending now, so a night is never cut in two.
 * - Two days or more: one band per local calendar day, oldest first (yesterday and today for
 *   "48 h"), so a week or a month reads as a grid (the usual layout of baby trackers). A night
 *   that crosses midnight is drawn in two rows.
 *
 * sleepBand.js's `blockAt` assumes a 24-hour band, so the hit test for other spans lives here.
 */

import { MIN_HIT_PX } from './sleepBand.js';

const DAY_MS = 86400000;
const HOUR_MS = 3600000;

/** Rows to draw: [{ from, to, span, day }]; `day` is the local midnight, null for a rolling band. */
export function timelineRows(now, days) {
  if (days <= 1) return [{ from: now - days * DAY_MS, to: now, span: days * DAY_MS, day: null }];
  const rows = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const from = d.getTime();
    rows.push({ from, to: Math.min(from + DAY_MS, now), span: DAY_MS, day: from });
  }
  return rows;
}

/** Whole-hour ticks every `stepHours` across [from, from + span], as { t, left } (left in %). */
export function timelineTicks(from, span, stepHours) {
  const first = new Date(from);
  first.setMinutes(0, 0, 0);
  const ticks = [];
  for (let t = first.getTime(); t <= from + span; t += stepHours * HOUR_MS) {
    if (t >= from) ticks.push({ t, left: ((t - from) / span) * 100 });
  }
  return ticks;
}

/** Index of the block a tap at `x` px lands on, on a band `width` px wide covering `span` ms. */
export function blockAtSpan(blocks, x, width, from, span) {
  const px = (t) => ((t - from) / span) * width;
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
