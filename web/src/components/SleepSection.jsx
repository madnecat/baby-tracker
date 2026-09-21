import { useMemo, useState } from 'react';
import { normalizeSleeps, observedWakeWindows, predictNextSleep, sleepStats } from '../lib/sleep.js';
import { EVENT_COLORS, resolve } from '../lib/palette.js';
import { blockAt, sleepBlocks } from '../lib/sleepBand.js';
import { useColorScheme } from '../lib/useColorScheme.js';

const DAY_MS = 86400000;

const PHASE_LABEL = {
  1: 'No day/night rhythm yet',
  2: 'Day/night rhythm settled',
  3: 'Settled nap regime',
};

function formatHm(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

function formatClock(t) {
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** A clock time, prefixed with "Yesterday" when it is not today — the band spans midnight. */
function formatMoment(t, now) {
  return new Date(t).toDateString() === new Date(now).toDateString()
    ? formatClock(t)
    : `Yesterday ${formatClock(t)}`;
}

/**
 * The last 24 hours as one band, sleep blocks over an awake ground.
 *
 * Deliberately not a recharts chart: the useful thing here is the *shape* of the day — where the
 * long stretch sat, how chopped up the rest was — and a plain proportional band reads that at a
 * glance on a phone, at a fraction of the weight.
 *
 * Tapping a sleep block highlights it, dims the rest and shows its times underneath: a hover
 * tooltip does not exist on a touch screen.
 */
function Timeline({ intervals, now, color }) {
  const [selected, setSelected] = useState(null);
  const from = now - DAY_MS;
  const blocks = useMemo(() => sleepBlocks(intervals, from, now), [intervals, from, now]);
  const chosen = selected != null ? blocks[selected] : null;

  // Ticks every 6 hours, on the hour, so the band is readable against the wall clock.
  const ticks = [];
  const firstTick = new Date(from);
  firstTick.setMinutes(0, 0, 0);
  for (let t = firstTick.getTime(); t <= now; t += 6 * 3600000) {
    if (t < from) continue;
    ticks.push({ t, left: ((t - from) / DAY_MS) * 100 });
  }

  function handleClick(event) {
    // Measure the padding box (inside the 1px border), which is what the blocks are positioned in.
    const band = event.currentTarget;
    if (band.clientWidth === 0) return;
    const x = event.clientX - band.getBoundingClientRect().left - band.clientLeft;
    const index = blockAt(blocks, x, band.clientWidth, from);
    setSelected(index === selected ? null : index);
  }

  return (
    <div style={{ padding: '0 8px 4px' }}>
      <div
        onClick={handleClick}
        style={{
          position: 'relative',
          height: 40,
          borderRadius: 6,
          background: 'var(--page)',
          border: '1px solid var(--border)',
          overflow: 'hidden',
          cursor: 'pointer',
          touchAction: 'manipulation',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {blocks.map((b, index) => {
          const isChosen = index === selected;
          const dimmed = selected != null && !isChosen;
          return (
            <div
              key={`${b.start}-${b.end}`}
              style={{
                position: 'absolute',
                left: `${((b.start - from) / DAY_MS) * 100}%`,
                width: `${Math.max(0.6, ((b.end - b.start) / DAY_MS) * 100)}%`,
                top: 0,
                bottom: 0,
                background: color,
                opacity: dimmed ? 0.3 : isChosen ? 1 : 0.85,
                boxShadow: isChosen ? 'inset 0 0 0 2px var(--text-primary)' : 'none',
                transition: 'opacity 120ms',
                pointerEvents: 'none',
              }}
            />
          );
        })}
      </div>
      <div style={{ position: 'relative', height: 14, fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
        {ticks.map((tick) => (
          <span key={tick.t} style={{ position: 'absolute', left: `${tick.left}%`, transform: 'translateX(-50%)' }}>
            {formatClock(tick.t)}
          </span>
        ))}
      </div>
      <div
        aria-live="polite"
        style={{ minHeight: 20, marginTop: 8, fontSize: '0.78rem', color: 'var(--text-secondary)' }}
      >
        {chosen ? (
          <>
            <strong style={{ color: 'var(--text-primary)' }}>
              {formatMoment(chosen.fullStart, now)} → {chosen.open ? 'now' : formatMoment(chosen.end, now)}
            </strong>
            {' · '}
            {formatHm((chosen.end - chosen.fullStart) / 60000)}
          </>
        ) : (
          'Tap a sleep block for its times.'
        )}
      </div>
    </div>
  );
}

/**
 * Sleep on the Charts page: how much, in what shape, and what the prediction engine currently
 * believes about this child. The headline is a rolling 24 hours rather than a calendar day —
 * before a night exists, "today" is not a unit the child's sleep knows anything about.
 */
export function SleepSection({ events, child }) {
  const isDark = useColorScheme();
  const color = resolve(EVENT_COLORS.sleep, isDark);
  const now = Date.now();

  const { stats, intervals, windows, prediction } = useMemo(() => {
    const normalized = normalizeSleeps(events, now);
    const prediction = predictNextSleep(events, child, now);
    return {
      stats: sleepStats(events, child, now),
      intervals: normalized.intervals,
      windows: observedWakeWindows(normalized.intervals, events, prediction.ageWeeks, now),
      prediction,
    };
    // `now` is intentionally not a dependency: this page is not a live view, and re-running the
    // engine on every render would be wasteful for no visible gain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, child]);

  if (intervals.length === 0) {
    return (
      <>
        <h2 className="section-title">Sleep</h2>
        <div className="empty-state">No sleep logged yet.</div>
      </>
    );
  }

  const target = stats.target;
  const belowTarget = stats.rolling24 < target.min;
  const recentWindows = windows.slice(-8).reverse();

  return (
    <>
      <h2 className="section-title">Sleep</h2>

      <div className="chart-card">
        <h3>Last 24 hours</h3>
        <div style={{ padding: '0 8px 8px' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 600 }}>{formatHm(stats.rolling24)}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Typical at this age: {Math.round(target.min / 60)}–{Math.round(target.max / 60)}h
            {belowTarget ? ' · below the usual range' : ''}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>
            {stats.sleepCount24} sleeps · longest {formatHm(stats.longestStretch24)}
          </div>
        </div>
        <Timeline intervals={intervals} now={now} color={color} />
      </div>

      <div className="chart-card">
        <h3>Wake windows</h3>
        <p style={{ margin: '0 8px 8px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          Time awake between sleeps — what the prediction is learned from.
        </p>
        {recentWindows.length === 0 && <div className="empty-state">No complete wake windows yet.</div>}
        {recentWindows.map((w) => (
          <div className="history-item static" key={w.wokeAt}>
            <span className="dot" style={{ background: color }} />
            <div className="details">
              <div>
                {formatHm(w.minutes)}
                {w.excluded ? ' — looks like a sleep went unlogged' : ''}
              </div>
              <div className="time">
                Awake {formatClock(w.wokeAt)} → {formatClock(w.sleptAt)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <p style={{ margin: '-8px 8px 20px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
        {PHASE_LABEL[prediction.phase]}
        {prediction.napRegime ? ` · ${prediction.napRegime.naps} naps a day` : ''}
        {prediction.nightWindow
          ? ` · night sits around ${String(prediction.nightWindow.startHour).padStart(2, '0')}:00–${String(
              prediction.nightWindow.endHour
            ).padStart(2, '0')}:00`
          : ''}
        {prediction.disturbed ? ' · unsettled the last few days' : ''}
      </p>
    </>
  );
}
