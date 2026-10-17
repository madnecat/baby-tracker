import { useMemo } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ageInWeeksAt } from '../lib/sleep.js';
import { longestNightStretchTypical } from '../lib/sleepGuidance.js';
import { PROGRESS_TUNABLES, nightlyStretches, stretchTrend } from '../lib/sleepProgress.js';
import { useColorScheme } from '../lib/useColorScheme.js';
import { CHART_CHROME, EVENT_COLORS, resolve } from '../lib/palette.js';
import { formatDayShort, formatMinutes } from '../lib/dateUtils.js';
import { t } from '../i18n/index.js';

const DAY_MS = 86400000;
const FLAT_MINUTES_PER_WEEK = 5;

/**
 * Charts page: is the longest unbroken night stretch getting longer? One bar per night, a robust
 * trend line over them and the indicative range for her age. Nothing here changes any prediction.
 */
export function NightProgressCard({ events, child, days }) {
  const isDark = useColorScheme();
  const color = resolve(EVENT_COLORS.sleep, isDark);
  const grid = resolve(CHART_CHROME.gridline, isDark);
  const axis = resolve(CHART_CHROME.axis, isDark);
  const muted = resolve(CHART_CHROME.mutedText, isDark);
  const surface = resolve(CHART_CHROME.surface, isDark);
  const text = resolve(CHART_CHROME.primaryText, isDark);

  const model = useMemo(() => {
    const now = Date.now();
    const rows = nightlyStretches(events, now, days);
    const withData = rows.filter((r) => r.hasData);
    if (withData.length === 0) return null;
    const trend = stretchTrend(rows);
    const data = withData.map((r) => ({
      day: formatDayShort(r.start),
      minutes: r.longest,
      trend: trend ? Math.max(0, Math.round(trend.intercept + trend.perDay * (r.start / DAY_MS))) : undefined,
    }));
    return {
      data,
      trend,
      count: withData.length,
      typical: longestNightStretchTypical(ageInWeeksAt(child?.dateOfBirth, now)),
    };
  }, [events, child, days]);

  if (!model) return null;
  const { data, trend, typical } = model;

  // Whole-hour gridlines (every 2 h once the bars get tall), so the axis reads without arithmetic.
  const tallest = Math.max(...data.map((d) => d.minutes));
  const topHour = Math.max(2, Math.ceil(tallest / 60));
  const stepHours = topHour > 6 ? 2 : 1;
  const hourTicks = [];
  for (let h = 0; h <= topHour + (topHour % stepHours); h += stepHours) hourTicks.push(h * 60);

  let trendLine = null;
  if (!trend) {
    trendLine = t('sleep.progress.notEnough', { count: model.count, needed: PROGRESS_TUNABLES.trendMinNights });
  } else if (!trend.clear) {
    // No number: quoting "+70 min a week" and then admitting it is unclear says it twice over.
    trendLine = t('sleep.progress.trendUnclear');
  } else if (Math.abs(trend.perWeek) < FLAT_MINUTES_PER_WEEK) {
    trendLine = t('sleep.progress.trendFlat');
  } else {
    trendLine = t(trend.perWeek > 0 ? 'sleep.progress.trendUp' : 'sleep.progress.trendDown', {
      minutes: Math.abs(trend.perWeek),
    });
  }

  const noteStyle = { margin: '0 8px 6px', fontSize: '0.78rem', color: 'var(--text-secondary)' };

  return (
    <div className="chart-card">
      <h3>{t('sleep.progress.title')}</h3>
      <p style={noteStyle}>{t('sleep.progress.hint')}</p>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 4, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11, fill: muted }}
            axisLine={{ stroke: axis }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: muted }}
            axisLine={false}
            tickLine={false}
            width={32}
            domain={[0, hourTicks.at(-1)]}
            ticks={hourTicks}
            tickFormatter={(m) => m / 60}
            label={{
              value: t('chartsPage.unit.hours'),
              angle: -90,
              position: 'insideLeft',
              fill: muted,
              fontSize: 11,
            }}
          />
          <Tooltip
            formatter={(value) => formatMinutes(value)}
            contentStyle={{ background: surface, border: `1px solid ${grid}`, borderRadius: 8 }}
            labelStyle={{ color: text }}
            itemStyle={{ color: text }}
          />
          <Bar dataKey="minutes" name={t('sleep.progress.series')} fill={color} radius={[3, 3, 0, 0]} maxBarSize={18} />
          {trend && (
            <Line
              dataKey="trend"
              name={t('sleep.progress.trendSeries')}
              stroke={text}
              strokeDasharray="5 4"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      <p style={{ ...noteStyle, color: 'var(--text-primary)' }}>
        {trendLine}
      </p>
      {typical && (
        <p style={noteStyle}>
          {t('sleep.progress.typical', { min: formatMinutes(typical.lo), max: formatMinutes(typical.hi) })}
        </p>
      )}
    </div>
  );
}
