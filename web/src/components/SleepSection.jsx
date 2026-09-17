import { useMemo } from 'react';
import { normalizeSleeps, observedWakeWindows, predictNextSleep, sleepStats } from '../lib/sleep.js';
import { EVENT_COLORS, resolve } from '../lib/palette.js';
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

/**
 * The last 24 hours as one band, sleep blocks over an awake ground.
 *
 * Deliberately not a recharts chart: the useful thing here is the *shape* of the day — where the
 * long stretch sat, how chopped up the rest was — and a plain proportional band reads that at a
 * glance on a phone, at a fraction of the weight.
 */
function Timeline({ intervals, now, color }) {
  const from = now - DAY_MS;
  const blocks = intervals
    .filter((s) => !s.suspect && s.effectiveEnd > from && s.start < now)
    .map((s) => {
      const start = Math.max(s.start, from);
      const end = Math.min(s.effectiveEnd, now);
      return {
        key: `${s.start}-${s.effectiveEnd}`,
        left: ((start - from) / DAY_MS) * 100,
        width: Math.max(0.6, ((end - start) / DAY_MS) * 100),
        title: `${formatClock(start)}–${formatClock(end)}`,
      };
    });

  // Ticks every 6 hours, on the hour, so the band is readable against the wall clock.
  const ticks = [];
  const firstTick = new Date(from);
  firstTick.setMinutes(0, 0, 0);
  for (let t = firstTick.getTime(); t <= now; t += 6 * 3600000) {
    if (t < from) continue;
    ticks.push({ t, left: ((t - from) / DAY_MS) * 100 });
  }

  return (
    <div style={{ padding: '0 8px 4px' }}>
      <div
        style={{
          position: 'relative',
          height: 28,
          borderRadius: 6,
          background: 'var(--page)',
          border: '1px solid var(--border)',
          overflow: 'hidden',
        }}
      >
        {blocks.map((b) => (
          <div
            key={b.key}
            title={b.title}
            style={{
              position: 'absolute',
              left: `${b.left}%`,
              width: `${b.width}%`,
              top: 0,
              bottom: 0,
              background: color,
              opacity: 0.85,
            }}
          />
        ))}
      </div>
      <div style={{ position: 'relative', height: 14, fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
        {ticks.map((tick) => (
          <span key={tick.t} style={{ position: 'absolute', left: `${tick.left}%`, transform: 'translateX(-50%)' }}>
            {formatClock(tick.t)}
          </span>
        ))}
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
