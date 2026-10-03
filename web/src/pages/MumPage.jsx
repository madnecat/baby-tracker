import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { EditEventSheet } from '../components/EditEventSheet.jsx';
import { ContractionChart } from '../components/ContractionChart.jsx';
import { EVENT_COLORS, eventTypeLabel, resolve as resolveColor } from '../lib/palette.js';
import { useColorScheme } from '../lib/useColorScheme.js';
import { formatDateOnly, formatDateTime, formatDuration, dayKey } from '../lib/dateUtils.js';
import { formatNumber, t, tOr } from '../i18n/index.js';
import {
  getMedicationStatus,
  lastDoseFor,
  loggedMedicationNames,
  medicationDisplayName,
  medicationsFor,
  nextDoseInfo,
} from '../lib/medications.js';

// A number for people ("2,5" in French); stored values that are not numbers show as they are.
function shownNumber(value) {
  if (value == null) return '?';
  return typeof value === 'number' ? formatNumber(value) : String(value);
}

function summarize(event) {
  const d = event.details || {};
  switch (event.type) {
    case 'contraction': {
      const duration = formatDuration(event.startedAt, event.endedAt);
      return d.intensity
        ? t('mum.summary.contraction', { intensity: tOr('mum.intensity', d.intensity), duration })
        : t('mum.summary.contractionNoIntensity', { duration });
    }
    case 'medication': {
      const name = d.name != null ? medicationDisplayName(d.name) : eventTypeLabel('medication');
      if (!d.doseAmount) return name;
      return d.doseUnit
        ? t('mum.summary.medicationDose', { name, amount: shownNumber(d.doseAmount), unit: d.doseUnit })
        : t('mum.summary.medicationDoseNoUnit', { name, amount: shownNumber(d.doseAmount) });
    }
    case 'temperature':
      return t('mum.summary.temperature', { value: shownNumber(d.valueC) });
    default:
      return eventTypeLabel(event.type);
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
        <h2 className="section-title">{t('mum.contractionsTitle')}</h2>
        <button className="chip" onClick={onToggle}>
          {hidden ? t('mum.show') : t('mum.hide')}
        </button>
      </div>

      {hidden && <div className="empty-state">{t('mum.contractionsHidden')}</div>}
      {!hidden && groups.length === 0 && <div className="empty-state">{t('mum.noContractions')}</div>}

      {!hidden &&
        groups.map(([day, items]) => (
          <div className="history-day" key={day}>
            <h3>{formatDateOnly(items[0].event.startedAt)}</h3>
            {items.map(({ event, previous }) => (
              <div className="history-item" key={event.id} onClick={() => onSelect(event)}>
                <span className="dot" style={{ background: resolveColor(EVENT_COLORS.contraction, isDark) }} />
                <div className="details">
                  <div>{summarize(event)}</div>
                  <div className="time">{formatDateTime(event.startedAt)}</div>
                  {previous && (
                    <div className="time">
                      {t('mum.afterPrevious', {
                        duration: formatDuration(previous.startedAt, event.startedAt),
                      })}
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
    const id = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <h2 className="section-title">{t('mum.medStatusTitle')}</h2>
      {names.length === 0 && <div className="empty-state">{t('mum.noMedication')}</div>}
      {names.map((name) => {
        const status = getMedicationStatus(lastDoseByName.get(name));
        return (
          <div className="history-item static" key={name}>
            <span className="dot" style={{ background: resolveColor(EVENT_COLORS.medication, isDark) }} />
            <div className="details">
              <div>{medicationDisplayName(name)}</div>
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
      <h2 className="section-title">{t('mum.medHistoryTitle')}</h2>
      <div className="filter-chips">
        <button className={`chip${!nameFilter ? ' active' : ''}`} onClick={() => setNameFilter(null)}>
          {t('mum.all')}
        </button>
        {names.map((n) => (
          <button
            key={n}
            className={`chip${nameFilter === n ? ' active' : ''}`}
            onClick={() => setNameFilter(n)}
          >
            {medicationDisplayName(n)}
          </button>
        ))}
      </div>

      {groups.length === 0 && <div className="empty-state">{t('mum.noMedication')}</div>}

      {groups.map(([day, items]) => (
        <div className="history-day" key={day}>
          <h3>{formatDateOnly(items[0].startedAt)}</h3>
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
  const medications = useMemo(
    () => medicationsFor(events.filter((e) => e.type === 'medication'), 'mom'),
    [events]
  );
  const medicationNames = useMemo(() => loggedMedicationNames(medications, 'mom'), [medications]);
  const lastDoseByName = useMemo(
    () => new Map(medicationNames.map((name) => [name, lastDoseFor(medications, name)])),
    [medications, medicationNames]
  );
  const temperatures = useMemo(
    () => events.filter((e) => e.type === 'temperature' && e.details?.who === 'mom'),
    [events]
  );

  if (loading) return <p>{t('common.loading')}</p>;

  return (
    <div>
      <h1 className="page-title">{t('mum.title')}</h1>

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
        title={t('mum.temperatureTitle')}
        items={temperatures.slice().reverse()}
        isDark={isDark}
        onSelect={setEditing}
        emptyText={t('mum.noTemperature')}
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
