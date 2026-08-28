import { useState } from 'react';
import { Sheet } from './Sheet.jsx';
import { api } from '../api/client.js';

export function OutingSheet({ onClose, onSaved }) {
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      await api.createEvent({
        type: 'outing',
        startedAt: now,
        endedAt: null,
        details: { location: location || null, notes: notes || null },
      });
      onSaved();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <Sheet title="Start an outing" onClose={onClose}>
      <div className="field">
        <label htmlFor="location">Location (optional)</label>
        <input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="notes">Notes (optional)</label>
        <input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {error && <p className="error-text">{error}</p>}
      <button className="btn btn-primary btn-block" disabled={saving} onClick={submit}>
        {saving ? 'Saving…' : 'Start outing'}
      </button>
    </Sheet>
  );
}
