// Breastfeeding helpers: which side to offer next, how a feed is described, and the (optional)
// observations a parent can attach to it. Nothing here is a score — tags describe what happened,
// and the numbers derived from them are only ever shown as plain medians and counts.

import { t } from '../i18n/index.js';

// `key` is the stored value; `labelKey` the catalog key. `label` is a lazy getter (resolved when
// read, never at import) kept so unmigrated callers work; prefer t(item.labelKey).
const choice = (prefix) => (key) => ({
  key,
  labelKey: `${prefix}.${key}`,
  get label() {
    return t(this.labelKey);
  },
});

export const FEED_TAGS = ['searching', 'efficient', 'dozed', 'hard_latch'].map(choice('feed.tag'));

export const AFTER_FEED = ['satisfied', 'still_hungry'].map(choice('feed.after'));

const SIDE_LABEL_KEY = { left: 'side.left', right: 'side.right' };
const OTHER = { left: 'right', right: 'left' };

/** Only 'left' / 'right' are valid starting sides; anything else (or missing) is unknown. */
function firstSideOf(details) {
  return details?.firstSide === 'left' || details?.firstSide === 'right' ? details.firstSide : null;
}

// After a long gap, alternating sides means nothing, so the suggestion is dropped.
export const SUGGESTION_MAX_AGE_MS = 12 * 3600000;

/**
 * The side to offer first at the next feed, or null when it can't be told.
 * The starting side alternates from one feed to the next (NHS / La Leche League guidance), so
 * both breasts are stimulated and drained:
 * - last feed only left  -> right;  only right -> left
 * - last feed on both sides -> the side it did *not* start on (left first -> right, right first -> left)
 * - a "both" with no recorded starting side (older feeds) -> no suggestion
 * - a last feed that ended more than SUGGESTION_MAX_AGE_MS ago -> no suggestion.
 * It is only ever a highlight; it never restricts what can be chosen.
 */
export function suggestNextSide(lastFeed, now = Date.now()) {
  if (!lastFeed) return null;
  const endedMs = Date.parse(lastFeed.endedAt);
  if (!Number.isFinite(endedMs) || now - endedMs > SUGGESTION_MAX_AGE_MS) return null;
  const side = lastFeed?.details?.side;
  if (side === 'left' || side === 'right') return OTHER[side];
  if (side === 'both') {
    const first = firstSideOf(lastFeed.details);
    return first ? OTHER[first] : null;
  }
  return null;
}

/** "Left", "Right", "Left, then Right", or "Both sides" when the order wasn't recorded. */
export function describeSides(details) {
  const side = details?.side;
  if (side === 'left' || side === 'right') return t(SIDE_LABEL_KEY[side]);
  if (side === 'both') {
    const first = firstSideOf(details);
    return first
      ? t('feed.sidesThen', { first: t(SIDE_LABEL_KEY[first]), second: t(SIDE_LABEL_KEY[OTHER[first]]) })
      : t('feed.bothSides');
  }
  return '?';
}

/**
 * The most recent *finished* breastfeed (any list order). Unfinished entries (a forgotten timer)
 * and ones dated in the future (a mis-edited time) are ignored so they can't win forever.
 */
export function lastFinishedFeed(events, now = Date.now()) {
  let best = null;
  for (const e of events) {
    if (e.type !== 'breastfeeding' || !e.endedAt) continue;
    const startedMs = Date.parse(e.startedAt);
    const endedMs = Date.parse(e.endedAt);
    if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs) || startedMs > now) continue;
    if (!best || startedMs > Date.parse(best.startedAt)) best = e;
  }
  return best;
}

export function tagLabels(details) {
  const tags = Array.isArray(details?.tags) ? details.tags : [];
  return FEED_TAGS.filter((tag) => tags.includes(tag.key)).map((tag) => t(tag.labelKey));
}

export function afterFeedLabel(details) {
  const found = AFTER_FEED.find((a) => a.key === details?.afterFeed);
  return found ? t(found.labelKey) : null;
}

/** One-line description of the observations on a feed, or null if it has none. */
export function observationsText(details) {
  const parts = [...tagLabels(details)];
  const after = afterFeedLabel(details);
  if (after) parts.push(after);
  return parts.length ? parts.join(' · ') : null;
}

function minutesOf(event) {
  if (!event.endedAt) return null;
  const ms = Date.parse(event.endedAt) - Date.parse(event.startedAt);
  return Number.isFinite(ms) && ms >= 0 ? ms / 60000 : null;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export const INSIGHT_MIN_TAGGED = 3;

/**
 * Plain numbers from the feeds with observations in the last `days` days — for context, not a
 * verdict: how long "efficient" feeds typically last versus "playing / searching" ones (a feed
 * with both tags is left out of both), and how often the baby seemed full afterwards.
 * Returns null until there are enough observed feeds for the numbers to mean anything.
 */
export function feedInsights(events, now = Date.now(), days = 14) {
  const since = now - days * 86400000;
  const feeds = events.filter(
    (e) => e.type === 'breastfeeding' && e.endedAt && Date.parse(e.startedAt) >= since
  );

  const observed = feeds.filter((e) => tagLabels(e.details).length > 0 || afterFeedLabel(e.details));
  if (observed.length < INSIGHT_MIN_TAGGED) return null;

  const has = (e, key) => Array.isArray(e.details?.tags) && e.details.tags.includes(key);
  const minutes = (list) => list.map(minutesOf).filter((m) => m != null);
  const efficient = feeds.filter((e) => has(e, 'efficient') && !has(e, 'searching'));
  const searching = feeds.filter((e) => has(e, 'searching') && !has(e, 'efficient'));
  const answered = feeds.filter((e) => afterFeedLabel(e.details));
  // Every finished feed lands in exactly one bucket: efficient, searching, "other notes" (any
  // other tag, an after-feed answer only, or both tags at once), or no notes at all.
  const observedSet = new Set(observed);
  const group = (list) => ({ count: list.length, medianMinutes: median(minutes(list)) });
  const other = observed.filter((e) => !efficient.includes(e) && !searching.includes(e));
  const none = feeds.filter((e) => !observedSet.has(e));

  return {
    observedCount: observed.length,
    totalCount: feeds.length,
    mix: { efficient: group(efficient), searching: group(searching), other: group(other), none: group(none) },
    efficient: { count: efficient.length, medianMinutes: median(minutes(efficient)) },
    searching: { count: searching.length, medianMinutes: median(minutes(searching)) },
    afterFeed: {
      answered: answered.length,
      satisfied: answered.filter((e) => e.details.afterFeed === 'satisfied').length,
    },
  };
}
