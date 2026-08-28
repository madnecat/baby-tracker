import { useState } from 'react';
import { Sheet } from './Sheet.jsx';
import { api } from '../api/client.js';

export function GrowthSheet({ onClose, onSaved }) {
  const [measuredAt, setMeasuredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [weightKg, setWeightKg] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [headCm, setHeadCm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await api.createGrowth({
        measuredAt,
        weightKg: weightKg ? Number(weightKg) : null,
        heightCm: heightCm ? Number(heightCm) : null,
        headCircumferenceCm: headCm ? Number(headCm) : null,
      });
      onSaved();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <Sheet title="Growth measurement" onClose={onClose}>
      <div className="field">
        <label htmlFor="measuredAt">Date</label>
        <input
          id="measuredAt"
          type="date"
          value={measuredAt}
          onChange={(e) => setMeasuredAt(e.target.value)}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="weight">Weight (kg)</label>
        <input
          id="weight"
          type="number"
          step="0.01"
          value={weightKg}
          onChange={(e) => setWeightKg(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="height">Height (cm)</label>
        <input
          id="height"
          type="number"
          step="0.1"
          value={heightCm}
          onChange={(e) => setHeightCm(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="head">Head circumference (cm)</label>
        <input
          id="head"
          type="number"
          step="0.1"
          value={headCm}
          onChange={(e) => setHeadCm(e.target.value)}
        />
      </div>
      {error && <p className="error-text">{error}</p>}
      <button className="btn btn-primary btn-block" disabled={saving} onClick={submit}>
        {saving ? 'Saving…' : 'Log measurement'}
      </button>
    </Sheet>
  );
}
