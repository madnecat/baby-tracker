import { useEffect, useMemo, useState } from 'react';
import { EventTile } from './EventTile.jsx';
import { MedicationSheet } from './MedicationSheet.jsx';
import { EVENT_COLORS } from '../lib/palette.js';

function statusFor(lastDose) {
  if (!lastDose) return { sub: 'Not logged recently', safe: true };
  const nextSafeAt = new Date(lastDose.startedAt).getTime() + lastDose.details.intervalHours * 3600000;
  const now = Date.now();
  if (now >= nextSafeAt) return { sub: 'Safe to take now', safe: true };
  const remainingMin = Math.ceil((nextSafeAt - now) / 60000);
  const h = Math.floor(remainingMin / 60);
  const m = remainingMin % 60;
  const nextTime = new Date(nextSafeAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return { sub: `Wait ${h > 0 ? `${h}h ` : ''}${m}m (until ${nextTime})`, safe: false };
}

/** `medicationEvents`: pre-fetched list of type=medication events, shared across all preset tiles by the parent (avoids one fetch per tile). */
export function MedicationTile({ preset, medicationEvents, onLogged }) {
  const [logging, setLogging] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const lastDose = useMemo(
    () => medicationEvents.find((e) => e.details?.name === preset.name) || null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [medicationEvents, preset.name, tick]
  );

  const status = statusFor(lastDose);

  return (
    <>
      <EventTile
        icon={preset.warning ? '⚠️' : '💊'}
        label={preset.name}
        sub={status.sub}
        color={EVENT_COLORS.medication}
        running={!status.safe}
        onClick={() => setLogging(true)}
      />
      {logging && (
        <MedicationSheet
          preset={preset}
          onClose={() => setLogging(false)}
          onSaved={() => {
            setLogging(false);
            onLogged?.();
          }}
        />
      )}
    </>
  );
}
