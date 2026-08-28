import { useState } from 'react';
import { Sheet } from './Sheet.jsx';
import { api } from '../api/client.js';

export function TemperatureSheet({ who, onClose, onSaved }) {
  const [valueC, setValueC] = useState('37.0');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      await api.createEvent({
        type: 'temperature',
        startedAt: now,
        endedAt: now,
        details: { who, valueC: Number(valueC), notes: notes || null },
      });
      onSaved();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <Sheet title={`Temperature (${who === 'mom' ? 'Mum' : 'Baby'})`} onClose={onClose}>
      <div className="field">
        <label htmlFor="temp">Temperature (°C)</label>
        <input
          id="temp"
          type="number"
          step="0.1"
          value={valueC}
          onChange={(e) => setValueC(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="tempnotes">Notes (optional)</label>
        <input id="tempnotes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {error && <p className="error-text">{error}</p>}
      <button className="btn btn-primary btn-block" disabled={saving} onClick={submit}>
        {saving ? 'Saving…' : 'Log temperature'}
      </button>
    </Sheet>
  );
}
