import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { EditEventSheet } from '../components/EditEventSheet.jsx';
import { ContractionChart } from '../components/ContractionChart.jsx';
import { EVENT_COLORS, resolve as resolveColor } from '../lib/palette.js';
import { useColorScheme } from '../lib/useColorScheme.js';
import { formatDateTime, formatDuration, dayKey } from '../lib/dateUtils.js';
import {
  getMedicationStatus,
  lastDoseFor,
  loggedMedicationNames,
  nextDoseInfo,
} from '../lib/medications.js';

function summarize(event) {
  const d = event.details || {};
  switch (event.type) {
    case 'contraction':
      return `Contraction${d.intensity ? ` — ${d.intensity}` : ' — intensity not recorded'} — ${formatDuration(event.startedAt, event.endedAt)}`;
    case 'medication':
      return `${d.name ?? 'Medication'}${d.doseAmount ? ` — ${d.doseAmount}${d.doseUnit || ''}` : ''}`;
    case 'temperature':
      return `Temperature — ${d.valueC ?? '?'}°C`;
    default:
      return event.type;
  }
}

function Section({ title, items, isDark, onSelect, emptyText, action }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 className="section-title">{title}</h2>
        {action}
      </div>
      {items.length === 0 && <div className="empty-state">{emptyText}</div>}
      {items.map((event) => (
        <div className="history-item" key={event.id} onClick={() => onSelect(event)}>
          <span className="dot" style={{ background: resolveColor(EVENT_COLORS[event.type], isDark) }} />
          <div className="details">
            <div>{summarize(event)}</div>
            <div className="time">{formatDateTime(event.startedAt)}</div>
          </div>
        </div>
      ))}
    </>
  );
}

function ContractionHistory({ contractions, hidden, isDark, onSelect, onToggle }) {
  // `contractions` is newest-first (the API returns events ordered by started_at DESC), so the
  // *previous* contraction of item i is i+1 — the gap is start-to-start, the way contractions
  // are timed clinically. Gaps are computed before grouping so the first item of a day still
  // shows its gap to the last one of the day before.
  const groups = useMemo(() => {
    const map = new Map();
    contractions.forEach((event, i) => {
      const previous = contractions[i + 1];
      const key = dayKey(event.startedAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ event, previous });
    });
    return [...map.entries()];
  }, [contractions]);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 className="section-title">Contraction events</h2>
        <button className="chip" onClick={onToggle}>
          {hidden ? 'Show' : 'Hide'}
        </button>
      </div>

      {hidden && <div className="empty-state">Contractions hidden.</div>}
      {!hidden && groups.length === 0 && <div className="empty-state">No contractions logged.</div>}

      {!hidden &&
        groups.map(([day, items]) => (
          <div className="history-day" key={day}>
            <h3>{day}</h3>
            {items.map(({ event, previous }) => (
              <div className="history-item" key={event.id} onClick={() => onSelect(event)}>
                <span className="dot" style={{ background: resolveColor(EVENT_COLORS.contraction, isDark) }} />
                <div className="details">
                  <div>{summarize(event)}</div>
                  <div className="time">{formatDateTime(event.startedAt)}</div>
                  {previous && (
                    <div className="time">
                      {formatDuration(previous.startedAt, event.startedAt)} after previous
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
    </>
  );
}

function MedicationStatusList({ names, lastDoseByName, isDark }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <h2 className="section-title">Medication status</h2>
      {names.length === 0 && <div className="empty-state">No medication logged yet.</div>}
      {names.map((name) => {
        const status = getMedicationStatus(lastDoseByName.get(name));
        return (
          <div className="history-item static" key={name}>
            <span className="dot" style={{ background: resolveColor(EVENT_COLORS.medication, isDark) }} />
            <div className="details">
              <div>{name}</div>
              <div className="time">{status.sub}</div>
            </div>
          </div>
        );
      })}
    </>
  );
}

function MedicationHistory({ medications, names, lastDoseByName, isDark, onSelect }) {
  const [nameFilter, setNameFilter] = useState(null);

  useEffect(() => {
    if (nameFilter && !names.includes(nameFilter)) setNameFilter(null);
  }, [nameFilter, names]);

  const filtered = useMemo(
    () => (nameFilter ? medications.filter((e) => e.details?.name === nameFilter) : medications),
    [medications, nameFilter]
  );

  // `filtered` is already newest-first (inherited from medications, which the API returns
  // ordered by started_at DESC — the same invariant lastDoseFor relies on), so no re-sort needed.
  const groups = useMemo(() => {
    const map = new Map();
    for (const item of filtered) {
      const key = dayKey(item.startedAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <>
      <h2 className="section-title">Medication history</h2>
      <div className="filter-chips">
        <button className={`chip${!nameFilter ? ' active' : ''}`} onClick={() => setNameFilter(null)}>
          All
        </button>
        {names.map((n) => (
          <button
            key={n}
            className={`chip${nameFilter === n ? ' active' : ''}`}
            onClick={() => setNameFilter(n)}
          >
            {n}
          </button>
        ))}
      </div>

      {groups.length === 0 && <div className="empty-state">No medication logged yet.</div>}

      {groups.map(([day, items]) => (
        <div className="history-day" key={day}>
          <h3>{day}</h3>
          {items.map((event) => {
            const next = nextDoseInfo(event);
            const isLatestForName = lastDoseByName.get(event.details?.name)?.id === event.id;
            return (
              <div className="history-item" key={event.id} onClick={() => onSelect(event)}>
                <span className="dot" style={{ background: resolveColor(EVENT_COLORS.medication, isDark) }} />
                <div className="details">
                  <div>{summarize(event)}</div>
                  <div className="time">{formatDateTime(event.startedAt)}</div>
                  {isLatestForName && next && <div className="time">{next.label}</div>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}

export default function MumPage() {
  const [events, setEvents] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hideContractions, setHideContractions] = useState(false);
  const isDark = useColorScheme();

  function load() {
    setLoading(true);
    api
      .listEvents()
      .then(setEvents)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);
  useEffect(() => {
    api
      .getSettings()
      .then((s) => setHideContractions(s.hideContractions))
      .catch(() => {});
  }, []);

  function toggleContractions() {
    const next = !hideContractions;
    setHideContractions(next);
    api.updateSettings({ hideContractions: next }).catch(() => setHideContractions(!next));
  }

  const contractions = useMemo(() => events.filter((e) => e.type === 'contraction'), [events]);
  const medications = useMemo(() => events.filter((e) => e.type === 'medication'), [events]);
  const medicationNames = useMemo(() => loggedMedicationNames(medications), [medications]);
  const lastDoseByName = useMemo(
    () => new Map(medicationNames.map((name) => [name, lastDoseFor(medications, name)])),
    [medications, medicationNames]
  );
  const temperatures = useMemo(
    () => events.filter((e) => e.type === 'temperature' && e.details?.who === 'mom'),
    [events]
  );

  if (loading) return <p>Loading…</p>;

  return (
    <div>
      <h1 className="page-title">Mum</h1>

      {!hideContractions && <ContractionChart contractions={contractions} />}

      <ContractionHistory
        contractions={contractions}
        hidden={hideContractions}
        isDark={isDark}
        onSelect={setEditing}
        onToggle={toggleContractions}
      />
      <MedicationStatusList names={medicationNames} lastDoseByName={lastDoseByName} isDark={isDark} />
      <MedicationHistory
        medications={medications}
        names={medicationNames}
        lastDoseByName={lastDoseByName}
        isDark={isDark}
        onSelect={setEditing}
      />
      <Section
        title="Temperature"
        items={temperatures.slice().reverse()}
        isDark={isDark}
        onSelect={setEditing}
        emptyText="No temperature readings logged."
      />

      {editing && (
        <EditEventSheet
          event={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
          onDeleted={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
