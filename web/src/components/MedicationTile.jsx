import { useEffect, useMemo, useState } from 'react';
import { EventTile } from './EventTile.jsx';
import { MedicationSheet } from './MedicationSheet.jsx';
import { EVENT_COLORS } from '../lib/palette.js';
import { getMedicationStatus, lastDoseFor } from '../lib/medications.js';

/** `medicationEvents`: pre-fetched list of type=medication events, shared across all preset tiles by the parent (avoids one fetch per tile). */
export function MedicationTile({ preset, medicationEvents, onLogged }) {
  const [logging, setLogging] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const lastDose = useMemo(
    () => lastDoseFor(medicationEvents, preset.name),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [medicationEvents, preset.name, tick]
  );

  const status = getMedicationStatus(lastDose);

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
