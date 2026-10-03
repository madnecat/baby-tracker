import { useState } from 'react';
import { Sheet } from './Sheet.jsx';
import { api, errorMessage } from '../api/client.js';
import { t } from '../i18n/index.js';
import { readNumberField } from '../lib/numberField.js';

export function EditGrowthSheet({ entry, onClose, onSaved, onDeleted }) {
  const [measuredAt, setMeasuredAt] = useState(entry.measuredAt);
  // Raw text as typed; parsed on save.
  const [weightKg, setWeightKg] = useState(String(entry.weightKg ?? ''));
  const [heightCm, setHeightCm] = useState(String(entry.heightCm ?? ''));
  const [headCm, setHeadCm] = useState(String(entry.headCircumferenceCm ?? ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    const weight = readNumberField(weightKg, { min: 0 });
    const height = readNumberField(heightCm, { min: 0 });
    const head = readNumberField(headCm, { min: 0 });
    if (weight.invalid || height.invalid || head.invalid) {
      setError(t('sheets.invalidNumber'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.updateGrowth(entry.id, {
        measuredAt,
        weightKg: weight.value,
        heightCm: height.value,
        headCircumferenceCm: head.value,
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
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
    <Sheet title={t('sheets.growth.editTitle')} onClose={onClose}>
      <div className="field">
        <label>{t('sheets.growth.date')}</label>
        <input type="date" value={measuredAt} onChange={(e) => setMeasuredAt(e.target.value)} />
      </div>
      <div className="field">
        <label>{t('sheets.growth.weight')}</label>
        <input type="text" inputMode="decimal" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
      </div>
      <div className="field">
        <label>{t('sheets.growth.height')}</label>
        <input type="text" inputMode="decimal" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
      </div>
      <div className="field">
        <label>{t('sheets.growth.head')}</label>
        <input type="text" inputMode="decimal" value={headCm} onChange={(e) => setHeadCm(e.target.value)} />
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="btn-row" style={{ marginTop: 16 }}>
        <button className="btn btn-primary btn-block" disabled={busy} onClick={save}>
          {t('common.save')}
        </button>
        <button className="btn btn-danger btn-block" disabled={busy} onClick={remove}>
          {t('common.delete')}
        </button>
      </div>
    </Sheet>
  );
}
