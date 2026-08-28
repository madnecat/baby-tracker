import { useState } from 'react';
import { Sheet } from './Sheet.jsx';
import { api } from '../api/client.js';

export function MedicationSheet({ preset, onClose, onSaved }) {
  const [name, setName] = useState(preset?.name || '');
  const [doseAmount, setDoseAmount] = useState(preset?.doseAmount ?? '');
  const [doseUnit, setDoseUnit] = useState(preset?.doseUnit || 'mg');
  const [intervalHours, setIntervalHours] = useState(preset?.intervalHours ?? 6);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    if (!name.trim()) {
      setError('Medication name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      await api.createEvent({
        type: 'medication',
        startedAt: now,
        endedAt: now,
        details: {
          name: name.trim(),
          doseAmount: doseAmount === '' ? null : Number(doseAmount),
          doseUnit: doseUnit || null,
          intervalHours: Number(intervalHours),
        },
      });
      onSaved();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <Sheet title={preset ? `Log ${preset.name}` : 'Log medication'} onClose={onClose}>
      {!preset && (
        <div className="field">
          <label htmlFor="medname">Medication name</label>
          <input id="medname" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
      )}
      {preset?.warning && (
        <div className="warning-banner">
          ⚠️ <span>{preset.warning}</span>
        </div>
      )}
      <div className="field">
        <label htmlFor="dose">Dose</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="dose"
            type="number"
            step="any"
            value={doseAmount}
            onChange={(e) => setDoseAmount(e.target.value)}
            style={{ flex: 2 }}
          />
          <input
            value={doseUnit}
            onChange={(e) => setDoseUnit(e.target.value)}
            placeholder="mg / g / mL"
            style={{ flex: 1 }}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="interval">Minimum hours until next dose</label>
        <input
          id="interval"
          type="number"
          step="0.5"
          min="0"
          value={intervalHours}
          onChange={(e) => setIntervalHours(e.target.value)}
        />
      </div>
      {error && <p className="error-text">{error}</p>}
      <button className="btn btn-primary btn-block" disabled={saving} onClick={submit}>
        {saving ? 'Saving…' : 'Log dose taken now'}
      </button>
    </Sheet>
  );
}
