import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useColorScheme } from '../lib/useColorScheme.js';
import { CHART_CHROME, resolve } from '../lib/palette.js';

/**
 * `series`: [{ key, label, color }] — color is a { light, dark } pair.
 * Stacks all series into one bar per day when there's more than one.
 */
export function FrequencyChart({ title, data, series, unitLabel }) {
  const isDark = useColorScheme();
  const grid = resolve(CHART_CHROME.gridline, isDark);
  const axis = resolve(CHART_CHROME.axis, isDark);
  const muted = resolve(CHART_CHROME.mutedText, isDark);
  const surface = resolve(CHART_CHROME.surface, isDark);
  const text = resolve(CHART_CHROME.primaryText, isDark);

  return (
    <div className="chart-card">
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 12, left: -12, bottom: 0 }}>
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
            label={
              unitLabel
                ? { value: unitLabel, angle: -90, position: 'insideLeft', fill: muted, fontSize: 11 }
                : undefined
            }
          />
          <Tooltip
            contentStyle={{ background: surface, border: `1px solid ${grid}`, borderRadius: 8 }}
            labelStyle={{ color: text }}
            itemStyle={{ color: text }}
          />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: muted }} />}
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="a"
              fill={resolve(s.color, isDark)}
              radius={[3, 3, 0, 0]}
              maxBarSize={18}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
