import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { EditEventSheet } from '../components/EditEventSheet.jsx';
import { EditGrowthSheet } from '../components/EditGrowthSheet.jsx';
import { EVENT_COLORS, resolve as resolveColor } from '../lib/palette.js';
import { useColorScheme } from '../lib/useColorScheme.js';
import { dayKey, formatDateTime, formatDuration } from '../lib/dateUtils.js';
import {
  getMedicationStatus,
  lastDoseFor,
  loggedMedicationNames,
  medicationsFor,
  nextDoseInfo,
} from '../lib/medications.js';

// Baby-only view — contractions live on the Mum tab instead. Medication shows only doses logged
// for the baby; each medication name also gets its own filter chip, keyed `med:<name>`.
const TYPES = ['diaper', 'bottle', 'breastfeeding', 'outing', 'temperature', 'sleep', 'growth', 'medication'];
const MED_PREFIX = 'med:';

function summarize(item) {
  const d = item.details || {};
  switch (item.type) {
    case 'diaper': {
      const parts = [];
      if (d.wet) parts.push('wet');
      if (d.dirty) parts.push(d.consistency ? `dirty — ${d.consistency}` : 'dirty');
      return `Diaper (${parts.join(', ') || 'none noted'})`;
    }
    case 'bottle':
      return `Bottle — ${d.volumeMl ?? '?'} mL (${d.contents ?? '?'})`;
    case 'breastfeeding':
      return `Breastfeeding — ${d.side ?? '?'} — ${formatDuration(item.startedAt, item.endedAt)}`;
    case 'outing':
      return `Outing${d.location ? ` — ${d.location}` : ''} — ${formatDuration(item.startedAt, item.endedAt)}`;
    case 'temperature':
      return `Temperature (${d.who || 'baby'}) — ${d.valueC ?? '?'}°C`;
    case 'medication':
      return `${d.name ?? 'Medication'}${d.doseAmount ? ` — ${d.doseAmount}${d.doseUnit || ''}` : ''}`;
    case 'sleep':
      return `Sleep — ${formatDuration(item.startedAt, item.endedAt)}`;
    case 'growth': {
      const parts = [];
      if (item.weightKg != null) parts.push(`${item.weightKg} kg`);
      if (item.heightCm != null) parts.push(`${item.heightCm} cm`);
      if (item.headCircumferenceCm != null) parts.push(`HC ${item.headCircumferenceCm} cm`);
      return `Growth — ${parts.join(', ') || 'no values'}`;
    }
    default:
      return item.type;
  }
}

function BabyMedicationStatus({ names, lastDoseByName, hidden, isDark, onToggle }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 className="section-title">Baby medication status</h2>
        <button className="chip" onClick={onToggle}>
          {hidden ? 'Show' : 'Hide'}
        </button>
      </div>
      {hidden && <div className="empty-state">Medication status hidden.</div>}
      {!hidden && names.length === 0 && <div className="empty-state">No baby medication logged yet.</div>}
      {!hidden &&
        names.map((name) => {
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

export default function HistoryPage() {
  const [events, setEvents] = useState([]);
  const [growth, setGrowth] = useState([]);
  const [filter, setFilter] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null);
  const [editingGrowth, setEditingGrowth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hideMedicationStatus, setHideMedicationStatus] = useState(false);
  const isDark = useColorScheme();

  function load() {
    setLoading(true);
    Promise.all([api.listEvents(), api.listGrowth()])
      .then(([e, g]) => {
        setEvents(e);
        setGrowth(g);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);
  useEffect(() => {
    api
      .getSettings()
      .then((s) => setHideMedicationStatus(s.hideBabyMedication))
      .catch(() => {});
  }, []);

  function toggleMedicationStatus() {
    const next = !hideMedicationStatus;
    setHideMedicationStatus(next);
    api.updateSettings({ hideBabyMedication: next }).catch(() => setHideMedicationStatus(!next));
  }

  // Baby doses only, newest-first (API order), which lastDoseFor relies on.
  const babyMedications = useMemo(
    () => medicationsFor(events.filter((e) => e.type === 'medication'), 'baby'),
    [events]
  );
  const medicationNames = useMemo(
    () => loggedMedicationNames(babyMedications, 'baby'),
    [babyMedications]
  );
  const lastDoseByName = useMemo(
    () => new Map(medicationNames.map((name) => [name, lastDoseFor(babyMedications, name)])),
    [babyMedications, medicationNames]
  );

  // A name chip can vanish (its only dose deleted); fall back to All rather than an empty list.
  useEffect(() => {
    if (filter?.startsWith(MED_PREFIX) && !medicationNames.includes(filter.slice(MED_PREFIX.length))) {
      setFilter(null);
    }
  }, [filter, medicationNames]);

  const items = useMemo(() => {
    // Baby-only page: drop mum's events (contractions, mum's medication) regardless of filter.
    const babyMedicationIds = new Set(babyMedications.map((e) => e.id));
    const babyEvents = events.filter(
      (e) => TYPES.includes(e.type) && (e.type !== 'medication' || babyMedicationIds.has(e.id))
    );
    let eventItems;
    if (filter === 'growth') eventItems = [];
    else if (filter?.startsWith(MED_PREFIX)) {
      const name = filter.slice(MED_PREFIX.length);
      eventItems = babyEvents.filter((e) => e.type === 'medication' && e.details?.name === name);
    } else eventItems = filter ? babyEvents.filter((e) => e.type === filter) : babyEvents;
    const growthItems =
      !filter || filter === 'growth'
        ? growth.map((g) => ({ ...g, type: 'growth', startedAt: g.measuredAt }))
        : [];
    return [...eventItems, ...growthItems].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  }, [events, growth, filter, babyMedications]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      const key = dayKey(item.startedAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return [...map.entries()];
  }, [items]);

  return (
    <div>
      <h1 className="page-title">History</h1>
      <div className="filter-chips">
        <button className={`chip${!filter ? ' active' : ''}`} onClick={() => setFilter(null)}>
          All
        </button>
        {TYPES.map((t) => (
          <button
            key={t}
            className={`chip${filter === t ? ' active' : ''}`}
            onClick={() => setFilter(t)}
          >
            {t}
          </button>
        ))}
        {medicationNames.map((n) => (
          <button
            key={MED_PREFIX + n}
            className={`chip${filter === MED_PREFIX + n ? ' active' : ''}`}
            onClick={() => setFilter(MED_PREFIX + n)}
          >
            {n}
          </button>
        ))}
      </div>

      <BabyMedicationStatus
        names={medicationNames}
        lastDoseByName={lastDoseByName}
        hidden={hideMedicationStatus}
        isDark={isDark}
        onToggle={toggleMedicationStatus}
      />

      {loading && <p>Loading…</p>}
      {!loading && groups.length === 0 && <div className="empty-state">No events yet.</div>}

      {groups.map(([day, dayItems]) => (
        <div className="history-day" key={day}>
          <h3>{day}</h3>
          {dayItems.map((item) => (
            <div
              className="history-item"
              key={`${item.type}-${item.id}`}
              onClick={() => (item.type === 'growth' ? setEditingGrowth(item) : setEditingEvent(item))}
            >
              <span
                className="dot"
                style={{ background: resolveColor(EVENT_COLORS[item.type], isDark) }}
              />
              <div className="details">
                <div>{summarize(item)}</div>
                <div className="time">{formatDateTime(item.startedAt)}</div>
                {item.type === 'medication' &&
                  lastDoseByName.get(item.details?.name)?.id === item.id &&
                  nextDoseInfo(item) && <div className="time">{nextDoseInfo(item).label}</div>}
              </div>
            </div>
          ))}
        </div>
      ))}

      {editingEvent && (
        <EditEventSheet
          event={editingEvent}
          onClose={() => setEditingEvent(null)}
          onSaved={() => {
            setEditingEvent(null);
            load();
          }}
          onDeleted={() => {
            setEditingEvent(null);
            load();
          }}
        />
      )}
      {editingGrowth && (
        <EditGrowthSheet
          entry={editingGrowth}
          onClose={() => setEditingGrowth(null)}
          onSaved={() => {
            setEditingGrowth(null);
            load();
          }}
          onDeleted={() => {
            setEditingGrowth(null);
            load();
          }}
        />
      )}
    </div>
  );
}
