import { useState } from 'react';
import { Sheet } from './Sheet.jsx';
import { api } from '../api/client.js';

const PRESETS = [30, 60, 90, 120, 150];

export function BottleSheet({ onClose, onSaved }) {
  const [volumeMl, setVolumeMl] = useState(90);
  const [contents, setContents] = useState('formula');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      await api.createEvent({
        type: 'bottle',
        startedAt: now,
        endedAt: now,
        details: { volumeMl: Number(volumeMl), contents },
      });
      onSaved();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <Sheet title="Bottle" onClose={onClose}>
      <div className="choice-row">
        {PRESETS.map((v) => (
          <button
            key={v}
            type="button"
            className={`choice-btn${volumeMl === v ? ' selected' : ''}`}
            onClick={() => setVolumeMl(v)}
          >
            {v} mL
          </button>
        ))}
      </div>
      <div className="field">
        <label htmlFor="volume">Volume (mL)</label>
        <input
          id="volume"
          type="number"
          min="0"
          value={volumeMl}
          onChange={(e) => setVolumeMl(e.target.value)}
        />
      </div>
      <div className="choice-row">
        {['formula', 'breast_milk', 'mixed'].map((c) => (
          <button
            key={c}
            type="button"
            className={`choice-btn${contents === c ? ' selected' : ''}`}
            onClick={() => setContents(c)}
          >
            {c === 'formula' ? 'Formula' : c === 'breast_milk' ? 'Breast milk' : 'Mixed'}
          </button>
        ))}
      </div>
      {error && <p className="error-text">{error}</p>}
      <button className="btn btn-primary btn-block" disabled={saving} onClick={submit}>
        {saving ? 'Saving…' : 'Log bottle'}
      </button>
    </Sheet>
  );
}
