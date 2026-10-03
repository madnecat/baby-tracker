import { useMemo } from 'react';
import { feedInsights } from '../lib/breastfeeding.js';
import { t } from '../i18n/index.js';
import { formatMinutes } from '../lib/dateUtils.js';
import { FEED_NOTE_COLORS, resolve } from '../lib/palette.js';
import { useColorScheme } from '../lib/useColorScheme.js';

const DAYS = 14;
const MIN_ANSWERED = 3; // fewer after-feed answers than this isn't a meaningful share
const MIN_FOR_TYPICAL = 2; // a single feed isn't a "typical" length
const ORDER = ['efficient', 'searching', 'other', 'none'];

const pctNumber = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
const pct = (part, whole) => t('chart.feedInsights.pct', { n: pctNumber(part, whole) });
const feedsText = (count) => t('chart.feedInsights.feeds', { count });
const labelOf = (k) => t(FEED_NOTE_COLORS[k].labelKey);
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
      <h3>{t('chart.feedInsights.title', { count: DAYS })}</h3>
      <p style={{ margin: '0 0 10px', fontSize: '0.85rem', ...secondary }}>
        {t('chart.feedInsights.summary', { feeds: feedsText(totalCount), observed: insights.observedCount })}
      </p>

      {/* One bar for the whole: a 2px surface gap between segments, rounded outer ends. */}
      <div
        role="img"
        aria-label={ORDER.map((k) =>
          t('chart.feedInsights.ariaItem', { label: labelOf(k), feeds: feedsText(mix[k].count) })
        ).join(', ')}
        style={{ display: 'flex', gap: 2, height: 16, borderRadius: 6, overflow: 'hidden', background: surface }}
      >
        {ORDER.filter((k) => mix[k].count > 0).map((k) => (
          <div
            key={k}
            title={t('chart.feedInsights.segment', {
              label: labelOf(k),
              feeds: feedsText(mix[k].count),
              pct: pct(mix[k].count, totalCount),
            })}
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
            <span style={{ flex: 1 }}>{labelOf(k)}</span>
            <span style={secondary}>
              {mix[k].count > 0 && mix[k].count >= MIN_FOR_TYPICAL && k !== 'none' && k !== 'other'
                ? t('chart.feedInsights.rowTypical', {
                    duration: formatMinutes(mix[k].medianMinutes),
                    count: mix[k].count,
                    pct: pct(mix[k].count, totalCount),
                  })
                : t('chart.feedInsights.row', { count: mix[k].count, pct: pct(mix[k].count, totalCount) })}
            </span>
          </div>
        ))}
      </div>

      {showFull && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: 6 }}>
            <span>{t('chart.feedInsights.fullLabel')}</span>
            <span style={secondary}>
              {t('chart.feedInsights.fullRatio', {
                satisfied: afterFeed.satisfied,
                answered: afterFeed.answered,
                pct: pct(afterFeed.satisfied, afterFeed.answered),
              })}
            </span>
          </div>
          <div
            role="img"
            aria-label={t('chart.feedInsights.fullAria', {
              count: afterFeed.answered,
              satisfied: afterFeed.satisfied,
              answered: afterFeed.answered,
            })}
            style={{ height: 10, borderRadius: 5, overflow: 'hidden', background: color('none') }}
          >
            <div
              style={{
                width: `${pctNumber(afterFeed.satisfied, afterFeed.answered)}%`,
                height: '100%',
                background: color('full'),
              }}
            />
          </div>
        </div>
      )}

      <p style={{ margin: '12px 0 0', fontSize: '0.8rem', ...secondary }}>
        {t('chart.feedInsights.disclaimer')}
      </p>
    </div>
  );
}
