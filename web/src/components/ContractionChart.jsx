import { Area, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useColorScheme } from '../lib/useColorScheme.js';
import { CHART_CHROME, EVENT_COLORS, resolve } from '../lib/palette.js';

const INTENSITY_HEIGHT = { mild: 1, moderate: 2, strong: 3, unspecified: 1.5 };
const HEIGHT_LABEL = { 0: '', 1: 'mild', 1.5: '', 2: 'moderate', 3: 'strong' };

/**
 * Mimics a real contraction monitor (toco) trace: flat at 0 baseline, a square
 * plateau for each contraction (width = duration, height = intensity), back to
 * 0 for the gap until the next one. Built as explicit (time, 0)→(time, height)
 * pairs at each edge rather than relying on Recharts' step interpolation, so
 * duration/intensity/gap all read from one familiar shape instead of three
 * separate encodings.
 */
export function ContractionChart({ contractions }) {
  const isDark = useColorScheme();
  const grid = resolve(CHART_CHROME.gridline, isDark);
  const axis = resolve(CHART_CHROME.axis, isDark);
  const muted = resolve(CHART_CHROME.mutedText, isDark);
  const surface = resolve(CHART_CHROME.surface, isDark);
  const text = resolve(CHART_CHROME.primaryText, isDark);
  const color = resolve(EVENT_COLORS.contraction, isDark);

  const sorted = [...contractions].sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));

  if (sorted.length === 0) {
    return (
      <div className="chart-card">
        <h3>Contractions (last 24h)</h3>
        <div className="empty-state">No contractions in the last 24 hours.</div>
      </div>
    );
  }

  const points = [];
  for (const c of sorted) {
    const startMs = new Date(c.startedAt).getTime();
    const endMs = c.endedAt ? new Date(c.endedAt).getTime() : startMs + 30000;
    const height = INTENSITY_HEIGHT[c.details?.intensity] ?? INTENSITY_HEIGHT.unspecified;
    points.push({ t: startMs, level: 0, meta: null });
    points.push({ t: startMs, level: height, meta: c });
    points.push({ t: endMs, level: height, meta: c });
    points.push({ t: endMs, level: 0, meta: null });
  }

  // Pad a little baseline before the first and after the last so the shape doesn't hug the edges.
  const padMs = 5 * 60000;
  const domain = [points[0].t - padMs, points[points.length - 1].t + padMs];

  return (
    <div className="chart-card">
      <h3>Contractions (last 24h)</h3>
      <p style={{ margin: '0 8px 8px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        Like a contraction monitor trace: width of each plateau = duration, height = intensity,
        flat stretches = gap between contractions.
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={points} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={domain}
            tickFormatter={(ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            tick={{ fontSize: 10, fill: muted }}
            axisLine={{ stroke: axis }}
            tickLine={false}
          />
          <YAxis
            dataKey="level"
            type="number"
            domain={[0, 3.5]}
            ticks={[1, 2, 3]}
            tickFormatter={(v) => HEIGHT_LABEL[v] ?? ''}
            tick={{ fontSize: 10, fill: muted }}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <Tooltip
            contentStyle={{ background: surface, border: `1px solid ${grid}`, borderRadius: 8 }}
            labelStyle={{ color: text }}
            itemStyle={{ color: text }}
            labelFormatter={(ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            formatter={(value, _name, props) => {
              const c = props.payload.meta;
              if (!c) return [null, null];
              return [c.details?.intensity || 'unspecified', 'Contraction'];
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
    </div>
  );
}
