import { useEffect, useMemo, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useColorScheme } from '../lib/useColorScheme.js';
import { CHART_CHROME, EVENT_COLORS, resolve } from '../lib/palette.js';

const INTENSITY_HEIGHT = { mild: 1, moderate: 2, strong: 3, unspecified: 1.5 };
const HEIGHT_LABEL = { 0: '', 1: 'mild', 1.5: '', 2: 'moderate', 3: 'strong' };

const RANGES = [
  { label: '1h', hours: 1 },
  { label: '2h', hours: 2 },
  { label: '4h', hours: 4 },
  { label: '12h', hours: 12 },
  { label: '24h', hours: 24 },
];
const DEFAULT_RANGE_HOURS = 2;

/** "45s" / "1m 20s" / "1h 30m" — plateau widths and gaps are short, so seconds matter here in a
 * way they don't for formatDuration's event durations. */
function shortDuration(ms) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    const s = seconds % 60;
    return s === 0 || minutes >= 10 ? `${minutes}m` : `${Math.floor(seconds / 60)}m ${s}s`;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

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

  const { points, count, summary } = useMemo(() => {
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

    const parts = [`${inWindow.length} contraction${inWindow.length === 1 ? '' : 's'}`];
    if (avgGapMs != null) parts.push(`every ~${shortDuration(avgGapMs)}`);
    if (avgLenMs != null) parts.push(`~${shortDuration(avgLenMs)} each`);

    return { points: pts, count: inWindow.length, summary: parts.join(' · ') };
  }, [contractions, windowStart, now]);

  const rangeLabel = RANGES.find((r) => r.hours === rangeHours)?.label ?? `${rangeHours}h`;

  return (
    <div className="chart-card">
      <h3>Contractions</h3>
      <div className="range-tabs" style={{ padding: '0 8px', marginBottom: 8 }}>
        {RANGES.map((r) => (
          <button
            key={r.hours}
            className={rangeHours === r.hours ? 'active' : ''}
            onClick={() => setRangeHours(r.hours)}
          >
            {r.label}
          </button>
        ))}
      </div>
      {count === 0 ? (
        <div className="empty-state">No contractions in the last {rangeLabel}.</div>
      ) : (
        <>
          <p style={{ margin: '0 8px 8px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Last {rangeLabel} — {summary}
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={points} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                domain={[windowStart, now]}
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
        </>
      )}
      <p style={{ margin: '0 8px 8px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        Like a contraction monitor trace: width of each plateau = duration, height = intensity,
        flat stretches = gap between contractions.
      </p>
    </div>
  );
}
