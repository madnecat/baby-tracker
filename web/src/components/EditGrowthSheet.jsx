import { useState } from 'react';
import { Sheet } from './Sheet.jsx';
import { api } from '../api/client.js';

export function EditGrowthSheet({ entry, onClose, onSaved, onDeleted }) {
  const [measuredAt, setMeasuredAt] = useState(entry.measuredAt);
  const [weightKg, setWeightKg] = useState(entry.weightKg ?? '');
  const [heightCm, setHeightCm] = useState(entry.heightCm ?? '');
  const [headCm, setHeadCm] = useState(entry.headCircumferenceCm ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.updateGrowth(entry.id, {
        measuredAt,
        weightKg: weightKg === '' ? null : Number(weightKg),
        heightCm: heightCm === '' ? null : Number(heightCm),
        headCircumferenceCm: headCm === '' ? null : Number(headCm),
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
      await api.deleteGrowth(entry.id);
      onDeleted();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Edit growth measurement" onClose={onClose}>
      <div className="field">
        <label>Date</label>
        <input type="date" value={measuredAt} onChange={(e) => setMeasuredAt(e.target.value)} />
      </div>
      <div className="field">
        <label>Weight (kg)</label>
        <input type="number" step="0.01" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
      </div>
      <div className="field">
        <label>Height (cm)</label>
        <input type="number" step="0.1" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
      </div>
      <div className="field">
        <label>Head circumference (cm)</label>
        <input type="number" step="0.1" value={headCm} onChange={(e) => setHeadCm(e.target.value)} />
      </div>
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
