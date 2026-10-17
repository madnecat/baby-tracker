import { useMemo, useState } from 'react';
import { normalizeSleeps, observedWakeWindows, predictNextSleep, sleepStats } from '../lib/sleep.js';
import { EVENT_COLORS, resolve } from '../lib/palette.js';
import { useColorScheme } from '../lib/useColorScheme.js';
import { formatClock, formatMinutes } from '../lib/dateUtils.js';
import { t, tOr } from '../i18n/index.js';
import { SleepTimeline } from './SleepTimeline.jsx';

const DAY_MS = 86400000;
const WINDOWS_SHOWN = 8;

/**
 * Sleep on the Charts page: how much, in what shape, and what the prediction engine currently
 * believes about this child. The headline is a rolling 24 hours rather than a calendar day —
 * before a night exists, "today" is not a unit the child's sleep knows anything about.
 */
export function SleepSection({ events, child, rangeDays, children }) {
  const isDark = useColorScheme();
  const color = resolve(EVENT_COLORS.sleep, isDark);
  const now = Date.now();
  const [showAllWindows, setShowAllWindows] = useState(false);

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
        <h2 className="section-title">{t('sleep.title')}</h2>
        <div className="empty-state">{t('sleep.empty')}</div>
      </>
    );
  }

  const target = stats.target;
  const belowTarget = stats.rolling24 < target.min;
  const inRange = windows.filter((w) => w.sleptAt >= now - rangeDays * DAY_MS).reverse();
  const shownWindows = showAllWindows ? inRange : inRange.slice(0, WINDOWS_SHOWN);

  return (
    <>
      <h2 className="section-title">{t('sleep.title')}</h2>

      <div className="chart-card">
        <h3>{t('sleep.last24h')}</h3>
        <div style={{ padding: '0 8px 8px' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 600 }}>{formatMinutes(stats.rolling24)}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            {t(belowTarget ? 'sleep.typicalForAgeBelow' : 'sleep.typicalForAge', {
              min: Math.round(target.min / 60),
              max: Math.round(target.max / 60),
            })}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>
            {t('sleep.countLongest', {
              count: stats.sleepCount24,
              duration: formatMinutes(stats.longestStretch24),
            })}
          </div>
        </div>
      </div>

      <div className="chart-card">
        <h3>{t('sleep.timeline')}</h3>
        <SleepTimeline intervals={intervals} now={now} color={color} days={rangeDays} />
      </div>

      {children}

      <div className="chart-card">
        <h3>{t('sleep.wakeWindows')}</h3>
        <p style={{ margin: '0 8px 8px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          {t('sleep.wakeWindowsHint')}
        </p>
        {shownWindows.length === 0 && <div className="empty-state">{t('sleep.noWakeWindows')}</div>}
        {shownWindows.map((w) => (
          <div className="history-item static" key={w.wokeAt}>
            <span className="dot" style={{ background: color }} />
            <div className="details">
              <div>
                {w.excluded
                  ? t('sleep.windowUnlogged', { duration: formatMinutes(w.minutes) })
                  : formatMinutes(w.minutes)}
              </div>
              <div className="time">
                {t('sleep.awakeRange', { from: formatClock(w.wokeAt), to: formatClock(w.sleptAt) })}
              </div>
            </div>
          </div>
        ))}
        {inRange.length > WINDOWS_SHOWN && (
          <button type="button" className="link-button" onClick={() => setShowAllWindows((v) => !v)}>
            {showAllWindows ? t('sleep.showFewerWindows') : t('sleep.showAllWindows', { count: inRange.length })}
          </button>
        )}
      </div>

      <p style={{ margin: '-8px 8px 20px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
        {[
          tOr('sleep.phase', prediction.phase),
          prediction.napRegime ? t('sleep.napsADay', { count: prediction.napRegime.naps }) : null,
          prediction.nightWindow
            ? t('sleep.nightWindow', {
                from: formatClock(new Date(2000, 0, 1, prediction.nightWindow.startHour)),
                to: formatClock(new Date(2000, 0, 1, prediction.nightWindow.endHour)),
              })
            : null,
          prediction.disturbed ? t('sleep.unsettled') : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </>
  );
}
