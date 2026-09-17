import { useEffect, useMemo, useState } from 'react';
import { predictNextSleep } from '../lib/sleep.js';
import { EVENT_COLORS, resolve } from '../lib/palette.js';
import { useColorScheme } from '../lib/useColorScheme.js';

const PHASE_LABEL = {
  1: 'No day/night rhythm yet — sleeps around the clock',
  2: 'Day/night rhythm settled',
  3: 'Settled nap regime',
};

function formatClock(t) {
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Rounded to 5 minutes: the underlying estimate is nowhere near minute-precise, so don't imply it. */
function formatRange(from, to) {
  const round = (t) => Math.round(t / (5 * 60000)) * 5 * 60000;
  return `${formatClock(round(from))}–${formatClock(round(to))}`;
}

function formatGap(ms) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`;
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
        <h3>😴 Sleep</h3>
        <div className="empty-state">
          Couldn't load recent sleep — pull down to retry once you're back online.
        </div>
      </div>
    );
  }

  const { state, basis, dataQuality, disturbed, ageWeeks, baseline } = prediction;
  const personal = basis.source === 'personal';

  return (
    <div className="chart-card" style={{ borderLeft: `3px solid ${color}` }}>
      <h3>😴 Sleep</h3>

      <div style={{ padding: '0 8px 8px', display: 'grid', gap: 4 }}>
        {state === 'unknown' && prediction.suspectRunningSleep && (
          <>
            <Line>
              <strong>Sleep still running since {formatClock(prediction.asleepSince)}</strong>
            </Line>
            <Line muted>
              That's longer than {child?.name || 'she'} usually sleeps — if the timer was left on,
              stop it or fix the entry in History. It's left out of today's totals until then.
            </Line>
          </>
        )}

        {state === 'unknown' && !prediction.suspectRunningSleep && prediction.staleHistory && (
          <>
            <Line>
              <strong>No prediction — nothing logged recently</strong>
            </Line>
            <Line muted>
              Last sleep ended {new Date(prediction.lastWakeAt).toLocaleDateString()} at{' '}
              {formatClock(prediction.lastWakeAt)}. Predictions come back once logging does.
            </Line>
          </>
        )}

        {state === 'unknown' && !prediction.suspectRunningSleep && !prediction.staleHistory && (
          <Line muted>Not enough sleep logged yet to say anything useful.</Line>
        )}

        {state === 'asleep' && (
          <>
            <Line>
              <strong>Asleep since {formatClock(prediction.asleepSince)}</strong> ·{' '}
              {formatGap(now - prediction.asleepSince)}
            </Line>
            <Line muted>
              {!personal
                ? 'Not enough of her own sleeps logged yet to guess when she’ll wake.'
                : prediction.pastTypical
                  ? 'Already longer than her usual stretch — she could wake any time.'
                  : `Usually wakes around ${formatRange(prediction.from, prediction.to)}`}
            </Line>
            {personal && (
              <Line muted>Based on {basis.samples} of her own recent sleeps</Line>
            )}
          </>
        )}

        {(state === 'awake' || state === 'overdue') && personal && (
          <>
            <Line>
              <strong>
                {state === 'overdue'
                  ? 'Past the usual window'
                  : `Next sleep ${formatRange(prediction.from, prediction.to)}`}
              </strong>
            </Line>
            <Line muted>
              {state === 'overdue'
                ? `Expected around ${formatClock(prediction.point)} — she may settle more easily now.`
                : `In about ${formatGap(prediction.point - now)}`}
            </Line>
          </>
        )}

        {(state === 'awake' || state === 'overdue') && !personal && (
          // Deliberately a different shape with no countdown: this is a number off a reference
          // table, not something we know about this child.
          <>
            <Line>
              <strong>
                Typical at {ageWeeks ?? '?'} weeks: {baseline.min}–{baseline.max} min awake
              </strong>
            </Line>
            <Line muted>
              Not enough of {child?.name ? `${child.name}'s` : 'her'} own sleeps logged yet (
              {basis.samples}/3) to predict from her pattern.
            </Line>
          </>
        )}

        {prediction.lastWakeAt && state !== 'asleep' && !prediction.staleHistory && (
          <Line muted>
            Last woke {formatClock(prediction.lastWakeAt)} · {formatGap(now - prediction.lastWakeAt)}{' '}
            ago
          </Line>
        )}

        {/* Only outside the asleep branch: there, `samples` counts sleep lengths, not wake windows. */}
        {personal && (state === 'awake' || state === 'overdue') && (
          <Line muted>
            Based on {basis.samples} of her own wake windows
            {basis.adjustments?.includes('short-nap') ? ', shortened after a brief nap' : ''}
          </Line>
        )}
      </div>

      {disturbed && (
        <div className="warning-banner">
          ⚠️{' '}
          <span>
            Sleep has been unsettled the last few days (teething, travel, a growth spurt?). The
            window is widened to match, and her usual pattern is kept rather than relearned.
          </span>
        </div>
      )}

      {dataQuality.lowQuality && (
        <div className="warning-banner">
          ⚠️{' '}
          <span>
            Some sleeps look like they weren't logged ({dataQuality.suspect} of{' '}
            {dataQuality.windows} recent stretches), so predictions will be off until logging
            catches up.
          </span>
        </div>
      )}

      <p style={{ margin: '0 8px 4px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
        {PHASE_LABEL[prediction.phase]}
        {prediction.napRegime ? ` · ${prediction.napRegime.naps} naps a day` : ''}
      </p>
    </div>
  );
}
