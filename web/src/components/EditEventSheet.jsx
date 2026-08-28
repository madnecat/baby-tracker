import { useState } from 'react';
import { Sheet } from './Sheet.jsx';
import { api } from '../api/client.js';
import { CONSISTENCY_OPTIONS } from '../lib/diaperOptions.js';

function toLocalInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(value) {
  return value ? new Date(value).toISOString() : null;
}

export function EditEventSheet({ event, onClose, onSaved, onDeleted }) {
  const [startedAt, setStartedAt] = useState(toLocalInputValue(event.startedAt));
  const [endedAt, setEndedAt] = useState(toLocalInputValue(event.endedAt));
  const [details, setDetails] = useState(event.details || {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function setDetail(key, value) {
    setDetails((d) => ({ ...d, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.updateEvent(event.id, {
        startedAt: fromLocalInputValue(startedAt),
        endedAt: fromLocalInputValue(endedAt),
        details,
      });
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.deleteEvent(event.id);
      onDeleted();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={`Edit ${event.type}`} onClose={onClose}>
      <div className="field">
        <label>Started at</label>
        <input type="datetime-local" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
      </div>
      <div className="field">
        <label>Ended at</label>
        <input type="datetime-local" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} />
      </div>

      {event.type === 'diaper' && (
        <>
          <div className="choice-row">
            <button
              type="button"
              className={`choice-btn${details.wet ? ' selected' : ''}`}
              onClick={() => setDetail('wet', !details.wet)}
            >
              💧 Wet
            </button>
            <button
              type="button"
              className={`choice-btn${details.dirty ? ' selected' : ''}`}
              onClick={() => setDetail('dirty', !details.dirty)}
            >
              💩 Dirty
            </button>
          </div>
          {details.dirty && (
            <>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Consistency
              </label>
              <div className="choice-row" style={{ marginTop: 6 }}>
                {CONSISTENCY_OPTIONS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={`choice-btn${details.consistency === c.key ? ' selected' : ''}`}
                    onClick={() =>
                      setDetail('consistency', details.consistency === c.key ? null : c.key)
                    }
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {event.type === 'bottle' && (
        <>
          <div className="field">
            <label>Volume (mL)</label>
            <input
              type="number"
              value={details.volumeMl ?? ''}
              onChange={(e) => setDetail('volumeMl', Number(e.target.value))}
            />
          </div>
          <div className="choice-row">
            {['formula', 'breast_milk', 'mixed'].map((c) => (
              <button
                key={c}
                type="button"
                className={`choice-btn${details.contents === c ? ' selected' : ''}`}
                onClick={() => setDetail('contents', c)}
              >
                {c === 'formula' ? 'Formula' : c === 'breast_milk' ? 'Breast milk' : 'Mixed'}
              </button>
            ))}
          </div>
        </>
      )}

      {event.type === 'breastfeeding' && (
        <div className="choice-row">
          {['left', 'right', 'both'].map((s) => (
            <button
              key={s}
              type="button"
              className={`choice-btn${details.side === s ? ' selected' : ''}`}
              onClick={() => setDetail('side', s)}
            >
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      )}

      {event.type === 'contraction' && (
        <div className="choice-row">
          {['mild', 'moderate', 'strong'].map((s) => (
            <button
              key={s}
              type="button"
              className={`choice-btn${details.intensity === s ? ' selected' : ''}`}
              onClick={() => setDetail('intensity', s)}
            >
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      )}

      {event.type === 'outing' && (
        <div className="field">
          <label>Location</label>
          <input
            value={details.location || ''}
            onChange={(e) => setDetail('location', e.target.value)}
          />
        </div>
      )}

      {event.type === 'temperature' && (
        <>
          <div className="choice-row">
            <button
              type="button"
              className={`choice-btn${details.who === 'baby' ? ' selected' : ''}`}
              onClick={() => setDetail('who', 'baby')}
            >
              👶 Baby
            </button>
            <button
              type="button"
              className={`choice-btn${details.who === 'mom' ? ' selected' : ''}`}
              onClick={() => setDetail('who', 'mom')}
            >
              🤰 Mum
            </button>
          </div>
          <div className="field">
            <label>Temperature (°C)</label>
            <input
              type="number"
              step="0.1"
              value={details.valueC ?? ''}
              onChange={(e) => setDetail('valueC', Number(e.target.value))}
            />
          </div>
        </>
      )}

      {event.type === 'medication' && (
        <>
          <div className="field">
            <label>Name</label>
            <input value={details.name || ''} onChange={(e) => setDetail('name', e.target.value)} />
          </div>
          <div className="field">
            <label>Dose amount</label>
            <input
              type="number"
              step="any"
              value={details.doseAmount ?? ''}
              onChange={(e) => setDetail('doseAmount', Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Dose unit</label>
            <input
              value={details.doseUnit || ''}
              onChange={(e) => setDetail('doseUnit', e.target.value)}
            />
          </div>
          <div className="field">
            <label>Minimum hours until next dose</label>
            <input
              type="number"
              step="0.5"
              value={details.intervalHours ?? ''}
              onChange={(e) => setDetail('intervalHours', Number(e.target.value))}
            />
          </div>
        </>
      )}

      {error && <p className="error-text">{error}</p>}

      <div className="btn-row" style={{ marginTop: 16 }}>
        <button className="btn btn-primary btn-block" disabled={busy} onClick={save}>
          Save
        </button>
        <button className="btn btn-danger btn-block" disabled={busy} onClick={remove}>
          Delete
        </button>
      </div>
    </Sheet>
  );
}
