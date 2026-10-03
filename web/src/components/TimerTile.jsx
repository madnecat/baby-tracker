import { useEffect, useState } from 'react';
import { EventTile } from './EventTile.jsx';
import { Sheet } from './Sheet.jsx';
import { api } from '../api/client.js';
import { t, tOr, hasMessage } from '../i18n/index.js';
import { formatDuration } from '../lib/dateUtils.js';

/**
 * A tile for an event type that runs as a start/stop timer (breastfeeding, contraction).
 * `label` may be a ready string or `labelKey` (catalog key); choices likewise take `label` or `labelKey`.
 * `startChoices`: [{ key, label | labelKey }] shown when starting (e.g. Left/Right/Both). A single
 * choice starts immediately on tap with no picker.
 * `stopChoices`: optional [{ key, label }] shown before stopping (e.g. contraction intensity).
 */
export function TimerTile({ type, icon, label: labelProp, labelKey, color, startChoices, stopChoices, onChange }) {
  const [active, setActive] = useState(undefined);
  const [tick, setTick] = useState(0);
  const [pickingStart, setPickingStart] = useState(false);
  const [pickingStop, setPickingStop] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.activeEvent(type).then(setActive);
  }, [type]);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [active]);

  async function start(choiceKey) {
    setBusy(true);
    try {
      const event = await api.createEvent({
        type,
        startedAt: new Date().toISOString(),
        endedAt: null,
        details: choiceKey ? { side: choiceKey } : {},
      });
      setActive(event);
      setPickingStart(false);
      onChange?.();
    } finally {
      setBusy(false);
    }
  }

  async function stop(extraKey) {
    setBusy(true);
    try {
      const details = { ...active.details };
      if (extraKey) details.intensity = extraKey;
      await api.updateEvent(active.id, { endedAt: new Date().toISOString(), details });
      setActive(null);
      setPickingStop(false);
      onChange?.();
    } finally {
      setBusy(false);
    }
  }

  function handleTap() {
    if (busy) return;
    if (active) {
      if (stopChoices?.length) setPickingStop(true);
      else stop();
    } else if (startChoices.length > 1) {
      setPickingStart(true);
    } else {
      start(startChoices[0]?.key);
    }
  }

  const label = labelKey ? t(labelKey) : labelProp;
  const choiceText = (c) => (c.labelKey ? t(c.labelKey) : c.label);
  const startKey = `tiles.timer.start.${type}`;
  const startTitle = hasMessage(startKey) ? t(startKey) : t('tiles.timer.startTitle', { label });

  const duration = active ? formatDuration(active.startedAt) : '';
  const side = active?.details?.side;
  const sub = active
    ? side
      ? t('tiles.subWithDuration', { detail: tOr('side', side), duration })
      : duration
    : undefined;

  return (
    <>
      <EventTile
        icon={active ? '⏹' : icon}
        label={active ? t('tiles.timer.stopLabel', { label }) : label}
        sub={sub}
        color={color}
        running={!!active}
        onClick={handleTap}
      />
      {pickingStart && (
        <Sheet title={startTitle} onClose={() => setPickingStart(false)}>
          <div className="choice-row">
            {startChoices.map((c) => (
              <button
                key={c.key}
                type="button"
                className="choice-btn"
                disabled={busy}
                onClick={() => start(c.key)}
              >
                {choiceText(c)}
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {pickingStop && (
        <Sheet title={t('tiles.timer.intensityTitle')} onClose={() => stop()}>
          <div className="choice-row">
            {stopChoices.map((c) => (
              <button
                key={c.key}
                type="button"
                className="choice-btn"
                disabled={busy}
                onClick={() => stop(c.key)}
              >
                {choiceText(c)}
              </button>
            ))}
          </div>
          <button className="btn btn-block" disabled={busy} onClick={() => stop()}>
            {t('common.skip')}
          </button>
        </Sheet>
      )}
    </>
  );
}
