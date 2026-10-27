import { useMemo, useState } from 'react';
import { sleepBlocks } from '../lib/sleepBand.js';
import { asleepShare, rhythmSummary } from '../lib/sleepRhythm.js';
import { SleepRhythm } from './SleepRhythm.jsx';
import { blockAtSpan, timelineRows, timelineTicks } from '../lib/sleepTimeline.js';
import { formatClock, formatDayShort, formatMinutes, formatMoment } from '../lib/dateUtils.js';
import { t } from '../i18n/index.js';

// A band is one row of sleep blocks over an awake ground. Row height shrinks as the range grows so
// 90 days stay a glanceable grid rather than a very long scroll.
const rowHeight = (days) => (days <= 1 ? 40 : days <= 2 ? 30 : days <= 7 ? 22 : days <= 30 ? 12 : 7);

function Band({ row, blocks, color, height, selected, onSelect }) {
  const { from, span } = row;

  function handleClick(event) {
    // Measure the padding box (inside the 1px border), which is what the blocks are positioned in.
    const band = event.currentTarget;
    if (band.clientWidth === 0) return;
    const x = event.clientX - band.getBoundingClientRect().left - band.clientLeft;
    onSelect(blockAtSpan(blocks, x, band.clientWidth, from, span));
  }

  return (
    <div
      onClick={handleClick}
      style={{
        position: 'relative',
        height,
        flex: 1,
        borderRadius: height > 20 ? 6 : 3,
        background: 'var(--page)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
        cursor: 'pointer',
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {blocks.map((b, index) => {
        const isChosen = index === selected;
        const dimmed = selected != null && !isChosen;
        return (
          <div
            key={`${b.start}-${b.end}`}
            style={{
              position: 'absolute',
              left: `${((b.start - from) / span) * 100}%`,
              width: `${Math.max(0.6, ((b.end - b.start) / span) * 100)}%`,
              top: 0,
              bottom: 0,
              background: color,
              opacity: dimmed ? 0.3 : isChosen ? 1 : 0.85,
              boxShadow: isChosen ? 'inset 0 0 0 2px var(--text-primary)' : 'none',
              transition: 'opacity 120ms',
              pointerEvents: 'none',
            }}
          />
        );
      })}
    </div>
  );
}

function Ticks({ from, span, stepHours }) {
  return (
    <div style={{ position: 'relative', height: 14, fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
      {timelineTicks(from, span, stepHours).map((tick) => (
        <span key={tick.t} style={{ position: 'absolute', left: `${tick.left}%`, transform: 'translateX(-50%)' }}>
          {formatClock(tick.t)}
        </span>
      ))}
    </div>
  );
}

/**
 * Sleep blocks over the selected range: a single rolling band for 24 h, one row per day beyond.
 *
 * Deliberately not a recharts chart: the useful thing is the *shape* of the day — where the long
 * stretch sat, how chopped up the rest was — and a plain proportional band reads that at a glance
 * on a phone, at a fraction of the weight.
 *
 * Tapping a block highlights it, dims the rest and shows its times underneath: a hover tooltip does
 * not exist on a touch screen.
 */
export function SleepTimeline({ intervals, now, color, days }) {
  const [selected, setSelected] = useState(null); // { row, index }
  const rows = useMemo(() => timelineRows(now, days), [now, days]);
  const rowBlocks = useMemo(() => rows.map((r) => sleepBlocks(intervals, r.from, r.to)), [rows, intervals]);
  // A typical day and night only mean something over a week or more.
  const rhythm = useMemo(
    () => (days >= 7 ? rhythmSummary(intervals, now, days) : null),
    [intervals, now, days]
  );
  // Over a week the bars of wake-ups and sleeps read best; from 30 days they flatten out and the typical
  // asleep/awake band is the one that shows the pattern.
  const asleep = useMemo(
    () => (rhythm && days >= 30 ? asleepShare(rows, rowBlocks) : null),
    [rhythm, days, rows, rowBlocks]
  );
  const height = rowHeight(days);
  const grid = days > 1;
  const chosen = selected ? rowBlocks[selected.row]?.[selected.index] : null;

  const select = (row) => (index) =>
    setSelected(index == null || (selected && selected.row === row && selected.index === index) ? null : { row, index });

  return (
    <div style={{ padding: '0 8px 4px' }}>
      {grid ? (
        <>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ width: 44 }} />
            <div style={{ flex: 1 }}>
              <Ticks from={rows[0].from} span={rows[0].span} stepHours={6} />
            </div>
          </div>
          {rhythm && <SleepRhythm rhythm={rhythm} asleep={asleep} color={color} />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: days > 30 ? 1 : 3 }}>
            {rows.map((row, i) => (
              <div key={row.from} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div
                  style={{
                    width: 44,
                    fontSize: '0.65rem',
                    color: 'var(--text-secondary)',
                    textAlign: 'right',
                    // Labelling all 90 rows would be unreadable: every 7th, plus the newest.
                    visibility: days <= 30 || i % 7 === 0 || i === rows.length - 1 ? 'visible' : 'hidden',
                  }}
                >
                  {formatDayShort(row.from)}
                </div>
                <Band
                  row={row}
                  blocks={rowBlocks[i]}
                  color={color}
                  height={height}
                  selected={selected?.row === i ? selected.index : null}
                  onSelect={select(i)}
                />
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <Band
            row={rows[0]}
            blocks={rowBlocks[0]}
            color={color}
            height={height}
            selected={selected?.row === 0 ? selected.index : null}
            onSelect={select(0)}
          />
          <Ticks from={rows[0].from} span={rows[0].span} stepHours={6} />
        </>
      )}
      <div
        aria-live="polite"
        style={{ minHeight: 20, marginTop: 8, fontSize: '0.78rem', color: 'var(--text-secondary)' }}
      >
        {chosen ? (
          <>
            <strong style={{ color: 'var(--text-primary)' }}>
              {t('sleep.range', {
                from: formatMoment(chosen.fullStart, now),
                to: chosen.open ? t('sleep.now') : formatMoment(chosen.end, now),
              })}
            </strong>
            {' · '}
            {formatMinutes((chosen.end - chosen.fullStart) / 60000)}
          </>
        ) : (
          t('sleep.tapHint')
        )}
      </div>
    </div>
  );
}
