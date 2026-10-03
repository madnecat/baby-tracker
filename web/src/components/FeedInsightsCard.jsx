import { useMemo } from 'react';
import { feedInsights } from '../lib/breastfeeding.js';
import { FEED_NOTE_COLORS, resolve } from '../lib/palette.js';
import { useColorScheme } from '../lib/useColorScheme.js';

const DAYS = 14;
const MIN_ANSWERED = 3; // fewer after-feed answers than this isn't a meaningful share
const MIN_FOR_TYPICAL = 2; // a single feed isn't a "typical" length
const ORDER = ['efficient', 'searching', 'other', 'none'];

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
const secondary = { color: 'var(--text-secondary)' };

/**
 * What parents noted on their breastfeeds, as one stacked bar (part-to-whole) plus a table-style
 * legend that carries the exact numbers, and a small meter for how often baby seemed full.
 * Descriptive only — it reports what was noted, never a verdict on the baby or the feeding.
 */
export function FeedInsightsCard({ events }) {
  const isDark = useColorScheme();
  const insights = useMemo(() => feedInsights(events, Date.now(), DAYS), [events]);
  if (!insights) return null;

  const { mix, totalCount, afterFeed } = insights;
  const color = (key) => resolve(FEED_NOTE_COLORS[key], isDark);
  const surface = isDark ? '#1a1a19' : '#fcfcfb';
  const showFull = afterFeed.answered >= MIN_ANSWERED;

  return (
    <div className="chart-card">
      <h3>Breastfeeding notes · last {DAYS} days</h3>
      <p style={{ margin: '0 0 10px', fontSize: '0.85rem', ...secondary }}>
        {totalCount} feeds, {insights.observedCount} with notes
      </p>

      {/* One bar for the whole: a 2px surface gap between segments, rounded outer ends. */}
      <div
        role="img"
        aria-label={ORDER.map((k) => `${FEED_NOTE_COLORS[k].label}: ${mix[k].count} feeds`).join(', ')}
        style={{ display: 'flex', gap: 2, height: 16, borderRadius: 6, overflow: 'hidden', background: surface }}
      >
        {ORDER.filter((k) => mix[k].count > 0).map((k) => (
          <div
            key={k}
            title={`${FEED_NOTE_COLORS[k].label}: ${mix[k].count} feeds (${pct(mix[k].count, totalCount)}%)`}
            style={{ flex: mix[k].count, minWidth: 6, background: color(k) }}
          />
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        {ORDER.map((k) => (
          <div
            key={k}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: '0.9rem' }}
          >
            <span
              aria-hidden="true"
              style={{ width: 10, height: 10, borderRadius: 2, background: color(k), flex: 'none' }}
            />
            <span style={{ flex: 1 }}>{FEED_NOTE_COLORS[k].label}</span>
            <span style={secondary}>
              {mix[k].count > 0 && mix[k].count >= MIN_FOR_TYPICAL && k !== 'none' && k !== 'other'
                ? `typically ${Math.round(mix[k].medianMinutes)} min · `
                : ''}
              {mix[k].count} · {pct(mix[k].count, totalCount)}%
            </span>
          </div>
        ))}
      </div>

      {showFull && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: 6 }}>
            <span>Seemed full afterwards</span>
            <span style={secondary}>
              {afterFeed.satisfied} of {afterFeed.answered} · {pct(afterFeed.satisfied, afterFeed.answered)}%
            </span>
          </div>
          <div
            role="img"
            aria-label={`Seemed full after ${afterFeed.satisfied} of ${afterFeed.answered} feeds`}
            style={{ height: 10, borderRadius: 5, overflow: 'hidden', background: color('none') }}
          >
            <div
              style={{
                width: `${pct(afterFeed.satisfied, afterFeed.answered)}%`,
                height: '100%',
                background: color('full'),
              }}
            />
          </div>
        </div>
      )}

      <p style={{ margin: '12px 0 0', fontSize: '0.8rem', ...secondary }}>
        From your own notes (typical = median length). Not a medical assessment — talk to your midwife
        or health visitor if you are worried about feeding.
      </p>
    </div>
  );
}
