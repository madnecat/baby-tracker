import { useState } from 'react';
import { Sheet } from './Sheet.jsx';
import { api } from '../api/client.js';
import { CONSISTENCY_OPTIONS } from '../lib/diaperOptions.js';

export function DiaperSheet({ onClose, onSaved }) {
  const [wet, setWet] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [consistency, setConsistency] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      await api.createEvent({
        type: 'diaper',
        startedAt: now,
        endedAt: now,
        details: { wet, dirty, consistency: dirty ? consistency : null },
      });
      onSaved();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <Sheet title="Diaper change" onClose={onClose}>
      <div className="choice-row">
        <button
          type="button"
          className={`choice-btn${wet ? ' selected' : ''}`}
          onClick={() => setWet((v) => !v)}
        >
          💧 Wet
        </button>
        <button
          type="button"
          className={`choice-btn${dirty ? ' selected' : ''}`}
          onClick={() => setDirty((v) => !v)}
        >
          💩 Dirty
        </button>
      </div>

      {dirty && (
        <>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Consistency (optional)
          </label>
          <div className="choice-row" style={{ marginTop: 6 }}>
            {CONSISTENCY_OPTIONS.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`choice-btn${consistency === c.key ? ' selected' : ''}`}
                onClick={() => setConsistency((v) => (v === c.key ? null : c.key))}
              >
                {c.label}
              </button>
            ))}
          </div>
        </>
      )}

      {error && <p className="error-text">{error}</p>}
      <button className="btn btn-primary btn-block" disabled={saving} onClick={submit}>
        {saving ? 'Saving…' : 'Log diaper change'}
      </button>
    </Sheet>
  );
}
