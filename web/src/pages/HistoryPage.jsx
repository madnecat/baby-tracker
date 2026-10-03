import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { EditEventSheet } from '../components/EditEventSheet.jsx';
import { EditGrowthSheet } from '../components/EditGrowthSheet.jsx';
import { EVENT_COLORS, eventTypeLabel, resolve as resolveColor } from '../lib/palette.js';
import { useColorScheme } from '../lib/useColorScheme.js';
import { dayKey, formatDateOnly, formatDateTime, formatDuration } from '../lib/dateUtils.js';
import { describeSides, observationsText } from '../lib/breastfeeding.js';
import { formatNumber, intlLocale, t, tOr } from '../i18n/index.js';
import {
  getMedicationStatus,
  lastDoseFor,
  loggedMedicationNames,
  medicationDisplayName,
  medicationsFor,
  nextDoseInfo,
} from '../lib/medications.js';

// Baby-only view — contractions live on the Mum tab instead. Medication shows only doses logged
// for the baby; each medication name also gets its own filter chip, keyed `med:<name>`.
const TYPES = ['diaper', 'bottle', 'breastfeeding', 'outing', 'temperature', 'sleep', 'growth', 'medication'];
const MED_PREFIX = 'med:';

// A number for people ("2,5" in French); stored values that are not numbers show as they are.
function shownNumber(value) {
  if (value == null) return '?';
  return typeof value === 'number' ? formatNumber(value) : String(value);
}

// Locale-aware list ("a, b" / "a et b"), so no separator is written by hand.
function joinList(parts) {
  return new Intl.ListFormat(intlLocale(), { style: 'short', type: 'unit' }).format(parts);
}

function summarize(item) {
  const d = item.details || {};
  switch (item.type) {
    case 'diaper': {
      const parts = [];
      if (d.wet) parts.push(t('history.diaper.wet'));
      if (d.dirty) {
        parts.push(
          d.consistency
            ? t('history.diaper.dirtyConsistency', { consistency: tOr('diaper.consistency', d.consistency) })
            : t('history.diaper.dirty')
        );
      }
      return parts.length
        ? t('history.summary.diaper', { parts: joinList(parts) })
        : t('history.summary.diaperNone');
    }
    case 'bottle':
      return t('history.summary.bottle', {
        volume: shownNumber(d.volumeMl),
        contents: d.contents == null ? '?' : tOr('history.contents', d.contents),
      });
    case 'breastfeeding':
      return t('history.summary.breastfeeding', {
        sides: describeSides(d),
        duration: formatDuration(item.startedAt, item.endedAt),
      });
    case 'outing':
      return d.location
        ? t('history.summary.outingAt', {
            location: d.location,
            duration: formatDuration(item.startedAt, item.endedAt),
          })
        : t('history.summary.outing', { duration: formatDuration(item.startedAt, item.endedAt) });
    case 'temperature':
      return t('history.summary.temperature', {
        who: tOr('history.who', d.who || 'baby'),
        value: shownNumber(d.valueC),
      });
    case 'medication': {
      const name = d.name != null ? medicationDisplayName(d.name) : eventTypeLabel('medication');
      if (!d.doseAmount) return name;
      return d.doseUnit
        ? t('history.summary.medicationDose', { name, amount: shownNumber(d.doseAmount), unit: d.doseUnit })
        : t('history.summary.medicationDoseNoUnit', { name, amount: shownNumber(d.doseAmount) });
    }
    case 'sleep':
      return t('history.summary.sleep', { duration: formatDuration(item.startedAt, item.endedAt) });
    case 'growth': {
      const parts = [];
      if (item.weightKg != null) parts.push(t('history.growth.weight', { value: shownNumber(item.weightKg) }));
      if (item.heightCm != null) parts.push(t('history.growth.height', { value: shownNumber(item.heightCm) }));
      if (item.headCircumferenceCm != null) {
        parts.push(t('history.growth.head', { value: shownNumber(item.headCircumferenceCm) }));
      }
      return parts.length
        ? t('history.summary.growth', { parts: joinList(parts) })
        : t('history.summary.growthNone');
    }
    default:
      return eventTypeLabel(item.type);
  }
}

function BabyMedicationStatus({ names, lastDoseByName, hidden, isDark, onToggle }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 className="section-title">{t('history.medStatusTitle')}</h2>
        <button className="chip" onClick={onToggle}>
          {hidden ? t('history.show') : t('history.hide')}
        </button>
      </div>
      {hidden && <div className="empty-state">{t('history.medStatusHidden')}</div>}
      {!hidden && names.length === 0 && <div className="empty-state">{t('history.noBabyMedication')}</div>}
      {!hidden &&
        names.map((name) => {
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
      <h1 className="page-title">{t('history.title')}</h1>
      <div className="filter-chips">
        <button className={`chip${!filter ? ' active' : ''}`} onClick={() => setFilter(null)}>
          {t('history.all')}
        </button>
        {TYPES.map((type) => (
          <button
            key={type}
            className={`chip${filter === type ? ' active' : ''}`}
            onClick={() => setFilter(type)}
          >
            {eventTypeLabel(type)}
          </button>
        ))}
        {medicationNames.map((n) => (
          <button
            key={MED_PREFIX + n}
            className={`chip${filter === MED_PREFIX + n ? ' active' : ''}`}
            onClick={() => setFilter(MED_PREFIX + n)}
          >
            {medicationDisplayName(n)}
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

      {loading && <p>{t('common.loading')}</p>}
      {!loading && groups.length === 0 && <div className="empty-state">{t('history.empty')}</div>}

      {groups.map(([day, dayItems]) => (
        <div className="history-day" key={day}>
          <h3>{formatDateOnly(dayItems[0].startedAt)}</h3>
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
                {item.type === 'breastfeeding' && observationsText(item.details) && (
                  <div className="time">{observationsText(item.details)}</div>
                )}
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
