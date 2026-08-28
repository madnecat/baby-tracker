import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { EditEventSheet } from '../components/EditEventSheet.jsx';
import { EditGrowthSheet } from '../components/EditGrowthSheet.jsx';
import { EVENT_COLORS, resolve as resolveColor } from '../lib/palette.js';
import { useColorScheme } from '../lib/useColorScheme.js';
import { dayKey, formatDateTime, formatDuration } from '../lib/dateUtils.js';

// Baby-only view — contraction/medication live on the Mum tab instead.
const TYPES = ['diaper', 'bottle', 'breastfeeding', 'outing', 'temperature', 'sleep', 'growth'];

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

export default function HistoryPage() {
  const [events, setEvents] = useState([]);
  const [growth, setGrowth] = useState([]);
  const [filter, setFilter] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null);
  const [editingGrowth, setEditingGrowth] = useState(null);
  const [loading, setLoading] = useState(true);
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

  const items = useMemo(() => {
    // Baby-only page: drop mum types (contraction/medication live on the Mum tab) regardless of filter.
    const babyEvents = events.filter((e) => TYPES.includes(e.type));
    const eventItems = filter === 'growth' ? [] : filter ? babyEvents.filter((e) => e.type === filter) : babyEvents;
    const growthItems =
      !filter || filter === 'growth'
        ? growth.map((g) => ({ ...g, type: 'growth', startedAt: g.measuredAt }))
        : [];
    return [...eventItems, ...growthItems].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  }, [events, growth, filter]);

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
      </div>

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
