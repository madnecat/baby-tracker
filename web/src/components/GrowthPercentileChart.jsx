import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getPercentileCurves, PERCENTILE_BANDS } from '../lib/whoPercentiles.js';
import { useColorScheme } from '../lib/useColorScheme.js';
import { CHART_CHROME, CHILD_SERIES_COLOR, WHO_BAND_COLORS, resolve } from '../lib/palette.js';

export function GrowthPercentileChart({ title, unit, indicator, sex, childPoints }) {
  const isDark = useColorScheme();
  const grid = resolve(CHART_CHROME.gridline, isDark);
  const axis = resolve(CHART_CHROME.axis, isDark);
  const muted = resolve(CHART_CHROME.mutedText, isDark);
  const surface = resolve(CHART_CHROME.surface, isDark);
  const text = resolve(CHART_CHROME.primaryText, isDark);
  const childColor = resolve(CHILD_SERIES_COLOR, isDark);

  const curves = getPercentileCurves(indicator, sex);

  return (
    <div className="chart-card">
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={curves} margin={{ top: 4, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis
            dataKey="ageMonths"
            type="number"
            domain={[0, 24]}
            tickCount={7}
            tick={{ fontSize: 11, fill: muted }}
            axisLine={{ stroke: axis }}
            tickLine={false}
            label={{ value: 'Age (months)', position: 'insideBottom', offset: -2, fill: muted, fontSize: 11 }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: muted }}
            axisLine={false}
            tickLine={false}
            width={36}
            label={{ value: unit, angle: -90, position: 'insideLeft', fill: muted, fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{ background: surface, border: `1px solid ${grid}`, borderRadius: 8 }}
            labelStyle={{ color: text }}
            itemStyle={{ color: text }}
            labelFormatter={(v) => `${v} mo`}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: muted }} />
          {PERCENTILE_BANDS.map((band) => (
            <Line
              key={band.label}
              dataKey={band.label}
              name={band.label}
              stroke={resolve(WHO_BAND_COLORS[band.label], isDark)}
              strokeWidth={band.label === '50th' ? 2 : 1}
              strokeDasharray={band.label === '3rd' || band.label === '97th' ? '4 3' : undefined}
              dot={false}
              isAnimationActive={false}
            />
          ))}
          <Line
            data={childPoints}
            dataKey="value"
            name="Your baby"
            stroke={childColor}
            strokeWidth={2.5}
            dot={{ r: 5, fill: childColor, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
