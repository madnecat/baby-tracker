import { useEffect, useMemo, useState } from 'react';
import { predictNextSleep } from '../lib/sleep.js';
import { EVENT_COLORS, resolve } from '../lib/palette.js';
import { useColorScheme } from '../lib/useColorScheme.js';
import { formatClock, formatGap } from '../lib/dateUtils.js';
import { t, tOr, intlLocale } from '../i18n/index.js';

/** Rounded to 5 minutes: the underlying estimate is nowhere near minute-precise, so don't imply it. */
function formatRange(from, to) {
  const round = (t) => Math.round(t / (5 * 60000)) * 5 * 60000;
  return t('sleep.timeRange', { from: formatClock(round(from)), to: formatClock(round(to)) });
}

function Line({ children, muted }) {
  return (
    <div style={{ fontSize: muted ? '0.78rem' : '0.9rem', color: muted ? 'var(--text-secondary)' : 'inherit' }}>
      {children}
    </div>
  );
}

/**
 * The prediction, on the page where the parent acts on it.
 *
 * Two rules shape everything here. First, never show a number the model hasn't earned: until there
 * are enough of this child's own observations, the card says so plainly and drops the countdown
 * rather than dressing a reference table up as knowledge about her. Second, never show a negative
 * countdown — being past the window is its own state, with its own wording.
 */
export function NextSleepCard({ events, child, loading, error }) {
  const isDark = useColorScheme();
  const color = resolve(EVENT_COLORS.sleep, isDark);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // The countdown re-renders every second; the estimator runs over the whole history, so it only
  // needs to run when the minute changes.
  const minute = Math.floor(now / 60000);
  const prediction = useMemo(
    () => (child === undefined ? null : predictNextSleep(events, child, minute * 60000)),
    [events, child, minute]
  );

  if (loading || !prediction) return null;

  if (error) {
    return (
      <div className="chart-card" style={{ borderLeft: `3px solid ${color}` }}>
        <h3>😴 {t('sleep.title')}</h3>
        <div className="empty-state">{t('sleep.loadError')}</div>
      </div>
    );
  }

  const { state, basis, dataQuality, disturbed, ageWeeks, baseline } = prediction;
  const personal = basis.source === 'personal';

  return (
    <div className="chart-card" style={{ borderLeft: `3px solid ${color}` }}>
      <h3>😴 {t('sleep.title')}</h3>

      <div style={{ padding: '0 8px 8px', display: 'grid', gap: 4 }}>
        {state === 'unknown' && prediction.suspectRunningSleep && (
          <>
            <Line>
              <strong>{t('sleep.runningSince', { time: formatClock(prediction.asleepSince) })}</strong>
            </Line>
            <Line muted>
              {child?.name ? t('sleep.runningLong', { name: child.name }) : t('sleep.runningLongNoName')}
            </Line>
          </>
        )}

        {state === 'unknown' && !prediction.suspectRunningSleep && prediction.staleHistory && (
          <>
            <Line>
              <strong>{t('sleep.noPrediction')}</strong>
            </Line>
            <Line muted>
              {t('sleep.staleDetail', {
                date: new Date(prediction.lastWakeAt).toLocaleDateString(intlLocale()),
                time: formatClock(prediction.lastWakeAt),
              })}
            </Line>
          </>
        )}

        {state === 'unknown' && !prediction.suspectRunningSleep && !prediction.staleHistory && (
          <Line muted>{t('sleep.notEnoughLogged')}</Line>
        )}

        {state === 'asleep' && (
          <>
            <Line>
              <strong>{t('sleep.asleepSince', { time: formatClock(prediction.asleepSince) })}</strong> ·{' '}
              {formatGap((now - prediction.asleepSince) / 60000)}
            </Line>
            <Line muted>
              {!personal
                ? t('sleep.wakeUnknown')
                : prediction.pastTypical
                  ? t('sleep.wakePastTypical')
                  : t('sleep.wakeUsually', { range: formatRange(prediction.from, prediction.to) })}
            </Line>
            {personal && (
              <Line muted>{t('sleep.basedOnSleeps', { count: basis.samples })}</Line>
            )}
          </>
        )}

        {(state === 'awake' || state === 'overdue') && personal && (
          <>
            <Line>
              <strong>
                {state === 'overdue'
                  ? t('sleep.overdue')
                  : t('sleep.nextSleep', { range: formatRange(prediction.from, prediction.to) })}
              </strong>
            </Line>
            <Line muted>
              {state === 'overdue'
                ? t('sleep.overdueDetail', { time: formatClock(prediction.point) })
                : prediction.point <= now
                  ? // Inside the window but past its midpoint: "In about 0 min" is a silly way to
                    // say the moment has arrived.
                    t('sleep.anyTimeNow')
                  : t('sleep.inAbout', { duration: formatGap((prediction.point - now) / 60000) })}
            </Line>
          </>
        )}

        {(state === 'awake' || state === 'overdue') && !personal && (
          // Deliberately a different shape with no countdown: this is a number off a reference
          // table, not something we know about this child.
          <>
            <Line>
              <strong>
                {ageWeeks == null
                  ? t('sleep.typicalUnknownAge', { min: baseline.min, max: baseline.max })
                  : t('sleep.typical', { count: ageWeeks, min: baseline.min, max: baseline.max })}
              </strong>
            </Line>
            <Line muted>
              {child?.name
                ? t('sleep.notEnoughOwn', { name: child.name, samples: basis.samples })
                : t('sleep.notEnoughOwnNoName', { samples: basis.samples })}
            </Line>
          </>
        )}

        {prediction.lastWakeAt && state !== 'asleep' && !prediction.staleHistory && (
          <Line muted>
            {t('sleep.lastWoke', { time: formatClock(prediction.lastWakeAt), ago: t('time.ago', { duration: formatGap((now - prediction.lastWakeAt) / 60000) }) })}
          </Line>
        )}

        {/* Only outside the asleep branch: there, `samples` counts sleep lengths, not wake windows. */}
        {personal && (state === 'awake' || state === 'overdue') && (
          <Line muted>
            {basis.adjustments?.includes('short-nap')
              ? t('sleep.basedOnWindowsShortNap', { count: basis.samples })
              : t('sleep.basedOnWindows', { count: basis.samples })}
          </Line>
        )}
      </div>

      {disturbed && (
        <div className="warning-banner">
          ⚠️{' '}
          <span>
            {t('sleep.disturbedBanner')}
          </span>
        </div>
      )}

      {dataQuality.lowQuality && (
        <div className="warning-banner">
          ⚠️{' '}
          <span>
            {t('sleep.lowQualityBanner', { count: dataQuality.windows, suspect: dataQuality.suspect })}
          </span>
        </div>
      )}

      <p style={{ margin: '0 8px 4px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
        {[
          prediction.phase === 1 ? t('sleep.phase.1Long') : tOr('sleep.phase', prediction.phase),
          prediction.napRegime ? t('sleep.napsADay', { count: prediction.napRegime.naps }) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </div>
  );
}
