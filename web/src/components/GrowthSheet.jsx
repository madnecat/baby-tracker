import { useState } from 'react';
import { Sheet } from './Sheet.jsx';
import { api, errorMessage } from '../api/client.js';
import { t } from '../i18n/index.js';
import { readNumberField } from '../lib/numberField.js';

export function GrowthSheet({ onClose, onSaved }) {
  const [measuredAt, setMeasuredAt] = useState(() => new Date().toISOString().slice(0, 10));
  // Raw text as typed; parsed on submit (a comma or a point both work).
  const [weightKg, setWeightKg] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [headCm, setHeadCm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    const weight = readNumberField(weightKg, { min: 0 });
    const height = readNumberField(heightCm, { min: 0 });
    const head = readNumberField(headCm, { min: 0 });
    if (weight.invalid || height.invalid || head.invalid) {
      setError(t('sheets.invalidNumber'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.createGrowth({
        measuredAt,
        weightKg: weight.value,
        heightCm: height.value,
        headCircumferenceCm: head.value,
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <Sheet title={t('sheets.growth.title')} onClose={onClose}>
      <div className="field">
        <label htmlFor="measuredAt">{t('sheets.growth.date')}</label>
        <input
          id="measuredAt"
          type="date"
          value={measuredAt}
          onChange={(e) => setMeasuredAt(e.target.value)}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="weight">{t('sheets.growth.weight')}</label>
        <input
          id="weight"
          type="text"
          inputMode="decimal"
          value={weightKg}
          onChange={(e) => setWeightKg(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="height">{t('sheets.growth.height')}</label>
        <input
          id="height"
          type="text"
          inputMode="decimal"
          value={heightCm}
          onChange={(e) => setHeightCm(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="head">{t('sheets.growth.head')}</label>
        <input
          id="head"
          type="text"
          inputMode="decimal"
          value={headCm}
          onChange={(e) => setHeadCm(e.target.value)}
        />
      </div>
      {error && <p className="error-text">{error}</p>}
      <button className="btn btn-primary btn-block" disabled={saving} onClick={submit}>
        {saving ? t('common.saving') : t('sheets.growth.submit')}
      </button>
    </Sheet>
  );
}
