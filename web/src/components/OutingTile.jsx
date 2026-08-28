import { useEffect, useState } from 'react';
import { EventTile } from './EventTile.jsx';
import { OutingSheet } from './OutingSheet.jsx';
import { api } from '../api/client.js';
import { formatDuration } from '../lib/dateUtils.js';

export function OutingTile({ color, onChange }) {
  const [active, setActive] = useState(undefined);
  const [tick, setTick] = useState(0);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.activeEvent('outing').then(setActive);
  }, []);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [active]);

  async function stop() {
    if (busy) return;
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
    ? `${active.details?.location ? `${active.details.location} · ` : ''}${formatDuration(active.startedAt)}`
    : undefined;

  return (
    <>
      <EventTile
        icon={active ? '⏹' : '🚶'}
        label={active ? 'Outing — End' : 'Outing'}
        sub={sub}
        color={color}
        running={!!active}
        onClick={() => (active ? stop() : setStarting(true))}
      />
      {starting && (
        <OutingSheet
          onClose={() => setStarting(false)}
          onSaved={async () => {
            setStarting(false);
            const event = await api.activeEvent('outing');
            setActive(event);
            onChange?.();
          }}
        />
      )}
    </>
  );
}
