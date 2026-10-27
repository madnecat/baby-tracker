import { DAY_STEPS, DAY_START_HOUR, NIGHT_START_HOUR } from '../lib/sleepRhythm.js';
import { formatClock, formatMinutes } from '../lib/dateUtils.js';
import { AWAKE_COLOR, resolve } from '../lib/palette.js';
import { useColorScheme } from '../lib/useColorScheme.js';
import { t } from '../i18n/index.js';

const LABEL_WIDTH = 44;
const BAR_ROW_HEIGHT = 30;

const clock = (minute) => formatClock(new Date(2000, 0, 1, Math.floor(minute / 60), Math.round(minute % 60)));
const range = (w) => t('sleep.rhythm.range', { from: clock(w.startMinute), to: clock(w.endMinute) });
const list = (windows, total) =>
  windows.map((w) => t('sleep.rhythm.item', { range: range(w), count: w.count, total })).join(', ');

/** A window as one or two [left%, width%] pieces (it may cross midnight). */
function pieces(w) {
  const left = (m) => (m / 1440) * 100;
  if (w.startMinute <= w.endMinute) return [[left(w.startMinute), left(w.endMinute - w.startMinute)]];
  return [
    [left(w.startMinute), left(1440 - w.startMinute)],
    [0, left(w.endMinute)],
  ];
}

const frame = {
  position: 'relative',
  flex: 1,
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  overflow: 'hidden',
};

function RowLabel({ children }) {
  return (
    <div style={{ width: LABEL_WIDTH, fontSize: '0.65rem', color: 'var(--text-secondary)', textAlign: 'right' }}>
      {children}
    </div>
  );
}

/**
 * The typical day in one glance: every quarter-hour is red when the child is usually asleep then, amber
 * when usually awake, and fades towards nothing where it varies from day to day.
 */
function AsleepRow({ slots, sleepColor, awakeColor }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <RowLabel>{t('sleep.rhythm.typical')}</RowLabel>
      <div role="img" aria-label={t('sleep.rhythm.typical')} style={{ ...frame, height: 30 }}>
        {slots.map((share, i) => {
          const asleep = share >= 0.5;
          const strength = Math.abs(share - 0.5) * 2; // 0 = a coin toss, 1 = every day the same
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${(i / slots.length) * 100}%`,
                width: `${100 / slots.length + 0.05}%`,
                background: asleep ? sleepColor : awakeColor,
                opacity: 0.1 + 0.9 * strength,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

/** A row of bars over the 24 hours: night shaded, the usual times highlighted. */
function BarRow({ label, share, scale, windows, color }) {
  const nightEnd = (DAY_START_HOUR / 24) * 100;
  const nightStart = (NIGHT_START_HOUR / 24) * 100;
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3 }}>
      <RowLabel>{label}</RowLabel>
      <div role="img" aria-label={label} style={{ ...frame, height: BAR_ROW_HEIGHT }}>
        {[
          [0, nightEnd],
          [nightStart, 100 - nightStart],
        ].map(([left, width]) => (
          <div
            key={left}
            style={{ position: 'absolute', top: 0, bottom: 0, left: `${left}%`, width: `${width}%`, background: 'var(--page)' }}
          />
        ))}
        {windows.flatMap(pieces).map(([left, width], i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${left}%`,
              width: `${width}%`,
              background: color,
              opacity: 0.22,
              borderLeft: `2px solid ${color}`,
              borderRight: `2px solid ${color}`,
            }}
          />
        ))}
        {share.map((value, i) =>
          value > 0 ? (
            <div
              key={i}
              style={{
                position: 'absolute',
                bottom: 0,
                left: `${(i / DAY_STEPS) * 100}%`,
                width: `${100 / DAY_STEPS - 0.3}%`,
                height: `${Math.min(1, value / scale) * 100}%`,
                background: color,
              }}
            />
          ) : null
        )}
      </div>
    </div>
  );
}

const lineStyle = { margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' };
const strong = { color: 'var(--text-primary)' };

function Swatch({ color, faded }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: 3,
        marginRight: 5,
        background: faded ? 'transparent' : color,
        border: faded ? '1px dashed var(--text-muted)' : '1px solid var(--border)',
        verticalAlign: '-1px',
      }}
    />
  );
}

/**
 * The typical night and day, drawn over 24 hours and written in two short lines. Red is asleep and
 * amber is awake everywhere: the top row shows which one the child usually is, the two below when
 * wake-ups (amber) and sleeps (red) usually start, and the text lines are in the colour of what they count.
 */
export function SleepRhythm({ rhythm, asleep, color }) {
  const awake = resolve(AWAKE_COLOR, useColorScheme());
  const { night, day } = rhythm;
  const scale = Math.max(0.3, Math.ceil(Math.max(...rhythm.wakeShare, ...rhythm.sleepShare) * 10) / 10);
  const nightText =
    night.perPeriod.median === 0 && night.medianMinutes == null
      ? t('sleep.rhythm.nightNone')
      : t('sleep.rhythm.night', {
          count: Math.round(night.perPeriod.median),
          min: night.perPeriod.min,
          max: night.perPeriod.max,
          duration: formatMinutes(night.medianMinutes ?? 0),
        });
  const dayText =
    day.perPeriod.median === 0 && day.medianMinutes == null
      ? t('sleep.rhythm.dayNone')
      : t('sleep.rhythm.day', {
          count: Math.round(day.perPeriod.median),
          min: day.perPeriod.min,
          max: day.perPeriod.max,
          duration: formatMinutes(day.medianMinutes ?? 0),
        });

  return (
    <div style={{ marginBottom: 12 }}>
      {asleep ? (
        <>
          <AsleepRow slots={asleep} sleepColor={color} awakeColor={awake} />
          <p style={{ ...lineStyle, margin: `6px 0 0 ${LABEL_WIDTH + 6}px`, fontSize: '0.68rem' }}>
            <Swatch color={color} />
            {t('sleep.rhythm.legendAsleep')} <Swatch color={awake} />
            {t('sleep.rhythm.legendAwake')} <Swatch faded />
            {t('sleep.rhythm.legendVaries')}
          </p>
        </>
      ) : (
        <>
          <BarRow label={t('sleep.rhythm.wakes')} share={rhythm.wakeShare} scale={scale} windows={night.usual} color={awake} />
          <BarRow label={t('sleep.rhythm.sleeps')} share={rhythm.sleepShare} scale={scale} windows={day.usual} color={color} />
          <p style={{ ...lineStyle, margin: `6px 0 0 ${LABEL_WIDTH + 6}px`, fontSize: '0.68rem' }}>
            {t('sleep.rhythm.hint', { percent: Math.round(scale * 100) })}
          </p>
        </>
      )}

      <div style={{ marginLeft: LABEL_WIDTH + 6 }}>
        <p style={lineStyle}>
          <Swatch color={awake} />
          <strong style={strong}>{nightText}</strong>
          {' · '}
          {night.usual.length
            ? t('sleep.rhythm.nightUsual', { list: list(night.usual, night.periods) })
            : t('sleep.rhythm.spread')}
        </p>
        <p style={lineStyle}>
          <Swatch color={color} />
          <strong style={strong}>{dayText}</strong>
          {' · '}
          {day.usual.length
            ? t('sleep.rhythm.dayUsual', { list: list(day.usual, day.periods) })
            : t('sleep.rhythm.spread')}
        </p>
      </div>
    </div>
  );
}
