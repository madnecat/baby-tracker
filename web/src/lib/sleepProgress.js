/**
 * Night-by-night progress: is the longest unbroken stretch of night sleep getting longer?
 *
 * Why this exists: "she wakes about as often as ever" and "her best stretch has gone from three
 * hours to three and a half" can both be true of the same month, and only the second shows once you
 * stop looking at individual nights. The Sleep card's headline is a rolling 24 hours, which cannot
 * show a trend. Same rules as sleep.js: no React, no date library, `now` is always a parameter.
 *
 * Definitions, chosen to match how the rest of the engine already talks about nights:
 * - A night is the evening of a local day to the morning after (19:00-07:00), as in dailySummaries.
 * - A *wake* is a pause of at least `minWakeMinutes`. Shorter pauses (a nappy change, a burp) are
 *   joined into one stretch, otherwise a baby who stirs for two minutes would "lose" her best night.
 * - A stretch belongs to the night when its midpoint is in the night window; its length is the whole
 *   stretch, not just the part inside the window, so one that runs past 07:00 is not cut short.
 * - Nights with too little logged sleep are skipped, not counted as zeros: they usually mean the
 *   family stopped logging, not that she did not sleep.
 */

import { normalizeSleeps } from './sleep.js';

const MINUTE = 60000;
const HOUR = 3600000;

export const PROGRESS_TUNABLES = {
  minWakeMinutes: 10,
  nightStartHour: 19,
  nightEndHour: 7,
  // Below this much logged sleep in the window, the night is treated as unlogged.
  minLoggedNightMinutes: 240,
  // Longest pause still read as "awake at night"; beyond it the night is treated as not fully logged.
  maxWakeMinutes: 240,
  // A stretch must last this long to anchor the start and end of the "night proper".
  anchorMinutes: 60,
  trendNights: 28,
  trendMinNights: 10,
  // A weekly rate is only quoted when the nights span at least this many days.
  trendMinSpanDays: 14,
  // A trend is called "clear" only when this share of night pairs slope the same way as the answer.
  trendAgreementClear: 0.6,
};
const T = PROGRESS_TUNABLES;

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Local wall-clock `hour:00` on the day `dayOffset` days from `t` (DST-safe: calendar days, not 24h). */
function localAt(t, dayOffset, hour) {
  const d = new Date(t);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

function localKey(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Closed, trustworthy sleeps joined across pauses shorter than `minWakeMinutes`. */
function stretches(intervals) {
  const out = [];
  for (const s of intervals) {
    if (s.suspect || s.open) continue;
    const last = out.at(-1);
    if (last && s.start - last.end < T.minWakeMinutes * MINUTE) last.end = Math.max(last.end, s.effectiveEnd);
    else out.push({ start: s.start, end: s.effectiveEnd });
  }
  return out;
}

/**
 * One row per *completed* local night, oldest first, for the last `days` evenings.
 * Row: { key, start, end, hasData, longest, total, wakes, awake } — minutes; `key` is the evening's date.
 */
export function nightlyStretches(events, now = Date.now(), days = T.trendNights) {
  const { intervals } = normalizeSleeps(events, now);
  const all = stretches(intervals);
  const rows = [];
  for (let i = days; i >= 0; i -= 1) {
    const start = localAt(now, -i, T.nightStartHour);
    const end = localAt(now, -i + 1, T.nightEndHour);
    if (end > now) continue; // tonight is not finished
    const inNight = all.filter((s) => s.end > start && s.start < end);
    const total = inNight.reduce((acc, s) => acc + (Math.min(s.end, end) - Math.max(s.start, start)) / MINUTE, 0);
    const mine = inNight.filter((s) => {
      const mid = (s.start + s.end) / 2;
      return mid >= start && mid < end;
    });
    // Only pauses lying wholly inside the night count as wakes (a nap ending at 19:05 followed by a
    // 19:40 bedtime is evening, not a night wake). A pause longer than `maxWakeMinutes` is not a
    // wake either: nobody is awake for half a night, it is a stretch nobody logged — and a
    // night with one is skipped rather than measured wrongly.
    // Counting runs from the first real stretch to the last one (>= `anchorMinutes`): the fussy
    // evening before bedtime and the stirring after the morning waking-up are not night wakes.
    const solid = (s) => (Math.min(s.end, end) - Math.max(s.start, start)) / MINUTE >= T.anchorMinutes;
    const first = inNight.findIndex(solid);
    const last = inNight.findLastIndex(solid);
    let wakes = 0;
    let awake = 0;
    let unlogged = false;
    for (let j = first + 1; first >= 0 && j <= last; j += 1) {
      const gap = (inNight[j].start - inNight[j - 1].end) / MINUTE;
      if (gap > T.maxWakeMinutes) unlogged = true;
      else if (gap > 0) {
        wakes += 1;
        awake += gap;
      }
    }
    const hasData = total >= T.minLoggedNightMinutes && mine.length > 0 && !unlogged;
    rows.push({
      key: localKey(start),
      start,
      end,
      hasData,
      // From the start of the night, not from the start of an evening nap it was joined to; it may
      // run on past 07:00 so a baby who sleeps in is not cut short.
      longest: hasData ? Math.round(Math.max(...mine.map((s) => (s.end - Math.max(s.start, start)) / MINUTE))) : 0,
      total: Math.round(total),
      wakes,
      awake: Math.round(awake),
    });
  }
  return rows;
}

/**
 * Theil-Sen slope, in minutes per week, of the longest stretch over the nights that have data.
 * The median of all pairwise slopes: one freak night (a single 6-hour stretch) moves a
 * least-squares line a lot and this hardly at all. `agreement` is the share of pairs sloping the
 * same way as the answer, a cheap honesty gauge: 0.5 is noise, close to 1 is a steady climb.
 */
export function stretchTrend(rows) {
  const pts = rows.filter((r) => r.hasData).map((r) => ({ x: r.start / (24 * HOUR), y: r.longest }));
  if (pts.length < T.trendMinNights) return null;
  if (pts.at(-1).x - pts[0].x < T.trendMinSpanDays) return null;
  const slopes = [];
  for (let i = 0; i < pts.length; i += 1) {
    for (let j = i + 1; j < pts.length; j += 1) {
      const dx = pts[j].x - pts[i].x;
      if (dx >= 0.5) slopes.push((pts[j].y - pts[i].y) / dx);
    }
  }
  if (!slopes.length) return null;
  const perDay = median(slopes);
  const agreement = slopes.filter((s) => (perDay >= 0 ? s >= 0 : s <= 0)).length / slopes.length;
  return {
    perDay,
    // Line through the data: y = intercept + perDay * (start / 24h). Lets a chart draw the trend.
    intercept: median(pts.map((p) => p.y - perDay * p.x)),
    perWeek: Math.round(perDay * 7),
    agreement,
    clear: agreement >= T.trendAgreementClear,
    nights: pts.length,
  };
}
