// A breastfeed can be paused (the baby dozes off on the breast) and resumed: it is still one feed.
// The pauses live in the event's details as `pauses: [{ from, to }]` (ISO strings, `to` null while
// the pause is still open), so no schema change is needed. Midwives ask how long the baby actually
// fed, so durations shown or charted for a feed go through `activeMs`, which leaves pauses out.

/** The well-formed pauses of a feed, oldest first; anything unreadable is ignored. */
export function pausesOf(details) {
  const list = Array.isArray(details?.pauses) ? details.pauses : [];
  return list
    .map((raw) => ({ raw, from: Date.parse(raw?.from), to: raw?.to == null ? null : Date.parse(raw.to) }))
    .filter((p) => Number.isFinite(p.from) && (p.to === null || (Number.isFinite(p.to) && p.to >= p.from)))
    .sort((a, b) => a.from - b.from)
    .map((p) => p.raw);
}

/** The open pause (no `to` yet) of a running feed, or null. */
export function openPause(details) {
  return pausesOf(details).find((p) => p.to == null) ?? null;
}

export function isPaused(event) {
  return !event?.endedAt && !!openPause(event?.details);
}

/** Milliseconds of the feed spent paused (an open pause counts up to `now`, or to the feed's end). */
export function pausedMs(event, now = Date.now()) {
  const start = Date.parse(event.startedAt);
  const end = event.endedAt ? Date.parse(event.endedAt) : now;
  let total = 0;
  for (const p of pausesOf(event.details)) {
    const from = Math.max(Date.parse(p.from), start);
    const to = Math.min(p.to == null ? end : Date.parse(p.to), end);
    if (to > from) total += to - from;
  }
  return total;
}

/** Milliseconds the baby was actually feeding: start to end (or now) minus the pauses. */
export function activeMs(event, now = Date.now()) {
  const start = Date.parse(event.startedAt);
  const end = event.endedAt ? Date.parse(event.endedAt) : now;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, end - start - pausedMs(event, now));
}

/** Details with a new open pause at `now` (unchanged if one is already open). */
export function withPause(details, now = new Date()) {
  if (openPause(details)) return details;
  return { ...details, pauses: [...pausesOf(details), { from: now.toISOString(), to: null }] };
}

/** Details with the open pause closed at `now` (unchanged if none is open). */
export function withResume(details, now = new Date()) {
  if (!openPause(details)) return details;
  return {
    ...details,
    pauses: pausesOf(details).map((p) => (p.to == null ? { ...p, to: now.toISOString() } : p)),
  };
}

/**
 * How to stop a feed. Stopping while paused ends the feed when the baby stopped (the pause start),
 * so a feed left paused doesn't run on for hours; that last pause then has no length and is dropped.
 */
export function stopPatch(event, now = new Date()) {
  const open = openPause(event.details);
  if (!open) return { endedAt: now.toISOString() };
  const pauses = pausesOf(event.details).filter((p) => p !== open);
  const details = { ...event.details };
  if (pauses.length) details.pauses = pauses;
  else delete details.pauses;
  return { endedAt: open.from, details };
}
