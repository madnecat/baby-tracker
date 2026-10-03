import { useEffect, useMemo, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useColorScheme } from '../lib/useColorScheme.js';
import { CHART_CHROME, EVENT_COLORS, resolve } from '../lib/palette.js';
import { t } from '../i18n/index.js';
import { formatClock, formatDurationMs } from '../lib/dateUtils.js';

const INTENSITY_HEIGHT = { mild: 1, moderate: 2, strong: 3, unspecified: 1.5 };
// Y-axis tick (numeric level) -> stored intensity value whose label is shown.
const HEIGHT_INTENSITY = { 1: 'mild', 2: 'moderate', 3: 'strong' };

const RANGE_HOURS = [1, 2, 4, 12, 24];
const rangeText = (hours) => t('time.h', { h: hours });
const DEFAULT_RANGE_HOURS = 2;

/**
 * Mimics a real contraction monitor (toco) trace: flat at 0 baseline, a square
 * plateau for each contraction (width = duration, height = intensity), back to
 * 0 for the gap until the next one. Built as explicit (time, 0)→(time, height)
 * pairs at each edge rather than relying on Recharts' step interpolation, so
 * duration/intensity/gap all read from one familiar shape instead of three
 * separate encodings.
 *
 * The x-axis is pinned to the selected window (now-N → now) rather than to the
 * data extent, so a gap since the last contraction reads at the same scale as
 * the gaps between them — that's the question being asked on arrival at the
 * maternity ward ("how many in the last hour?").
 */
export function ContractionChart({ contractions }) {
  const isDark = useColorScheme();
  const [rangeHours, setRangeHours] = useState(DEFAULT_RANGE_HOURS);
  const [now, setNow] = useState(() => Date.now());

  // Window edges are relative to "now", so the trace has to keep sliding while the page
  // sits open on a delivery-room phone.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const grid = resolve(CHART_CHROME.gridline, isDark);
  const axis = resolve(CHART_CHROME.axis, isDark);
  const muted = resolve(CHART_CHROME.mutedText, isDark);
  const surface = resolve(CHART_CHROME.surface, isDark);
  const text = resolve(CHART_CHROME.primaryText, isDark);
  const color = resolve(EVENT_COLORS.contraction, isDark);

  const windowStart = now - rangeHours * 3600000;

  const { points, count, avgGapMs, avgLenMs } = useMemo(() => {
    const inWindow = contractions
      .map((c) => {
        const startMs = new Date(c.startedAt).getTime();
        // Open-ended (still running) contractions are drawn up to now; a 30s stub keeps a
        // just-tapped one visible before it has any width.
        const endMs = c.endedAt ? new Date(c.endedAt).getTime() : Math.max(now, startMs + 30000);
        return { c, startMs, endMs };
      })
      .filter((x) => x.endMs >= windowStart && x.startMs <= now)
      .sort((a, b) => a.startMs - b.startMs);

    const pts = [];
    for (const { c, startMs, endMs } of inWindow) {
      // Clamp to the window so a contraction that began before it still shows its tail.
      const from = Math.max(startMs, windowStart);
      const to = Math.min(endMs, now);
      const height = INTENSITY_HEIGHT[c.details?.intensity] ?? INTENSITY_HEIGHT.unspecified;
      pts.push({ t: from, level: 0, meta: null });
      pts.push({ t: from, level: height, meta: c });
      pts.push({ t: to, level: height, meta: c });
      pts.push({ t: to, level: 0, meta: null });
    }

    // Average gap is start-to-start (how contractions are timed clinically), average length
    // is the plateau width — both only meaningful with something to compare.
    let avgGapMs = null;
    if (inWindow.length >= 2) {
      const first = inWindow[0].startMs;
      const last = inWindow[inWindow.length - 1].startMs;
      avgGapMs = (last - first) / (inWindow.length - 1);
    }
    const timed = inWindow.filter((x) => x.c.endedAt);
    const avgLenMs = timed.length
      ? timed.reduce((sum, x) => sum + (x.endMs - x.startMs), 0) / timed.length
      : null;

    return { points: pts, count: inWindow.length, avgGapMs, avgLenMs };
  }, [contractions, windowStart, now]);

  const rangeLabel = rangeText(rangeHours);
  const summary = [
    t('chart.contractions.count', { count }),
    avgGapMs != null ? t('chart.contractions.every', { duration: formatDurationMs(avgGapMs) }) : null,
    avgLenMs != null ? t('chart.contractions.each', { duration: formatDurationMs(avgLenMs) }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="chart-card">
      <h3>{t('chart.contractions.title')}</h3>
      <div className="range-tabs" style={{ padding: '0 8px', marginBottom: 8 }}>
        {RANGE_HOURS.map((hours) => (
          <button
            key={hours}
            className={rangeHours === hours ? 'active' : ''}
            onClick={() => setRangeHours(hours)}
          >
            {rangeText(hours)}
          </button>
        ))}
      </div>
      {count === 0 ? (
        <div className="empty-state">{t('chart.contractions.empty', { range: rangeLabel })}</div>
      ) : (
        <>
          <p style={{ margin: '0 8px 8px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            {t('chart.contractions.summaryLine', { range: rangeLabel, summary })}
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={points} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                domain={[windowStart, now]}
                tickFormatter={(ms) => formatClock(ms)}
                tick={{ fontSize: 10, fill: muted }}
                axisLine={{ stroke: axis }}
                tickLine={false}
              />
              <YAxis
                dataKey="level"
                type="number"
                domain={[0, 3.5]}
                ticks={[1, 2, 3]}
                tickFormatter={(v) => (HEIGHT_INTENSITY[v] ? t(`chart.intensity.${HEIGHT_INTENSITY[v]}`) : '')}
                tick={{ fontSize: 10, fill: muted }}
                axisLine={false}
                tickLine={false}
                width={64}
              />
              <Tooltip
                contentStyle={{ background: surface, border: `1px solid ${grid}`, borderRadius: 8 }}
                labelStyle={{ color: text }}
                itemStyle={{ color: text }}
                labelFormatter={(ms) => formatClock(ms)}
                formatter={(value, _name, props) => {
                  const c = props.payload.meta;
                  if (!c) return [null, null];
                  return [
                    t(`chart.intensity.${c.details?.intensity || 'unspecified'}`),
                    t('events.type.contraction'),
                  ];
                }}
              />
              <Area
                type="linear"
                dataKey="level"
                stroke={color}
                strokeWidth={2}
                fill={color}
                fillOpacity={0.25}
                isAnimationActive={false}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </>
      )}
      <p style={{ margin: '0 8px 8px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        {t('chart.contractions.hint')}
      </p>
    </div>
  );
}
