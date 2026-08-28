import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { EditEventSheet } from '../components/EditEventSheet.jsx';
import { ContractionChart } from '../components/ContractionChart.jsx';
import { EVENT_COLORS, resolve as resolveColor } from '../lib/palette.js';
import { useColorScheme } from '../lib/useColorScheme.js';
import { formatDateTime, formatDuration } from '../lib/dateUtils.js';

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

function Section({ title, items, isDark, onSelect, emptyText }) {
  return (
    <>
      <h2 className="section-title">{title}</h2>
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

export default function MumPage() {
  const [events, setEvents] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const isDark = useColorScheme();

  function load() {
    setLoading(true);
    api
      .listEvents()
      .then(setEvents)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const contractions = useMemo(() => events.filter((e) => e.type === 'contraction'), [events]);
  const recentContractions = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return contractions.filter((c) => new Date(c.startedAt).getTime() >= cutoff);
  }, [contractions]);
  const medications = useMemo(() => events.filter((e) => e.type === 'medication'), [events]);
  const temperatures = useMemo(
    () => events.filter((e) => e.type === 'temperature' && e.details?.who === 'mom'),
    [events]
  );

  if (loading) return <p>Loading…</p>;

  return (
    <div>
      <h1 className="page-title">Mum</h1>

      <ContractionChart contractions={recentContractions} />

      <Section
        title="Contractions"
        items={contractions}
        isDark={isDark}
        onSelect={setEditing}
        emptyText="No contractions logged."
      />
      <Section
        title="Medication"
        items={medications.slice().reverse()}
        isDark={isDark}
        onSelect={setEditing}
        emptyText="No medication logged."
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
