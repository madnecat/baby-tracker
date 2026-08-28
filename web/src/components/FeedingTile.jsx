import { useEffect, useState } from 'react';
import { EventTile } from './EventTile.jsx';
import { Sheet } from './Sheet.jsx';
import { BottleSheet } from './BottleSheet.jsx';
import { api } from '../api/client.js';
import { EVENT_COLORS } from '../lib/palette.js';
import { formatDuration } from '../lib/dateUtils.js';

const SIDE_CHOICES = [
  { key: 'left', label: 'Left' },
  { key: 'right', label: 'Right' },
  { key: 'both', label: 'Both' },
];

export function FeedingTile({ onChange }) {
  const [active, setActive] = useState(undefined);
  const [tick, setTick] = useState(0);
  const [choosing, setChoosing] = useState(false);
  const [pickingSide, setPickingSide] = useState(false);
  const [loggingBottle, setLoggingBottle] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.activeEvent('breastfeeding').then(setActive);
  }, []);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [active]);

  async function startBreastfeeding(side) {
    setBusy(true);
    try {
      const event = await api.createEvent({
        type: 'breastfeeding',
        startedAt: new Date().toISOString(),
        endedAt: null,
        details: { side },
      });
      setActive(event);
      setPickingSide(false);
      onChange?.();
    } finally {
      setBusy(false);
    }
  }

  async function stopBreastfeeding() {
    setBusy(true);
    try {
      await api.updateEvent(active.id, { endedAt: new Date().toISOString() });
      setActive(null);
      onChange?.();
    } finally {
      setBusy(false);
    }
  }

  const sub = active
    ? `${active.details?.side ? `${active.details.side} · ` : ''}${formatDuration(active.startedAt)}`
    : undefined;

  return (
    <>
      <EventTile
        icon={active ? '⏹' : '🍽️'}
        label={active ? 'Breastfeeding — Stop' : 'Feeding'}
        sub={sub}
        color={EVENT_COLORS.breastfeeding}
        running={!!active}
        onClick={() => (active ? stopBreastfeeding() : setChoosing(true))}
      />

      {choosing && (
        <Sheet title="Log a feed" onClose={() => setChoosing(false)}>
          <div className="choice-row">
            <button
              type="button"
              className="choice-btn"
              onClick={() => {
                setChoosing(false);
                setPickingSide(true);
              }}
            >
              🤱 Breastfeeding
            </button>
            <button
              type="button"
              className="choice-btn"
              onClick={() => {
                setChoosing(false);
                setLoggingBottle(true);
              }}
            >
              🍼 Bottle
            </button>
          </div>
        </Sheet>
      )}

      {pickingSide && (
        <Sheet title="Which side?" onClose={() => setPickingSide(false)}>
          <div className="choice-row">
            {SIDE_CHOICES.map((c) => (
              <button
                key={c.key}
                type="button"
                className="choice-btn"
                disabled={busy}
                onClick={() => startBreastfeeding(c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {loggingBottle && (
        <BottleSheet
          onClose={() => setLoggingBottle(false)}
          onSaved={() => {
            setLoggingBottle(false);
            onChange?.();
          }}
        />
      )}
    </>
  );
}
