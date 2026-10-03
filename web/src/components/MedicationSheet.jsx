import { useState } from 'react';
import { Sheet } from './Sheet.jsx';
import { api, errorMessage } from '../api/client.js';
import { t } from '../i18n/index.js';
import { medicationDisplayName, presetWarning } from '../lib/medications.js';
import { readNumberField } from '../lib/numberField.js';

export function MedicationSheet({ preset, who = 'mom', onClose, onSaved }) {
  // `name` is stored as-is (a preset's English name is its identifier); only the title is translated.
  const [name, setName] = useState(preset?.name || '');
  // Dose and interval hold the raw text typed; they are parsed on submit.
  const [doseAmount, setDoseAmount] = useState(String(preset?.doseAmount ?? ''));
  const [doseUnit, setDoseUnit] = useState(preset?.doseUnit || 'mg');
  const [intervalHours, setIntervalHours] = useState(String(preset?.intervalHours ?? 6));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const warning = presetWarning(preset);

  async function submit() {
    if (!name.trim()) {
      setError(t('sheets.medication.nameRequired'));
      return;
    }
    const dose = readNumberField(doseAmount, { min: 0 });
    const interval = readNumberField(intervalHours, { required: true, min: 0 });
    if (dose.invalid || interval.invalid) {
      setError(t('sheets.invalidNumber'));
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
          who,
          doseAmount: dose.value,
          doseUnit: doseUnit || null,
          intervalHours: interval.value,
        },
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <Sheet
      title={
        preset
          ? t('sheets.medication.titlePreset', { name: medicationDisplayName(preset.name) })
          : t('sheets.medication.titleCustom')
      }
      onClose={onClose}
    >
      {!preset && (
        <div className="field">
          <label htmlFor="medname">{t('sheets.medication.name')}</label>
          <input id="medname" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
      )}
      {warning && (
        <div className="warning-banner">
          ⚠️ <span>{warning}</span>
        </div>
      )}
      <div className="field">
        <label htmlFor="dose">{t('sheets.medication.dose')}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="dose"
            type="text"
            inputMode="decimal"
            value={doseAmount}
            onChange={(e) => setDoseAmount(e.target.value)}
            style={{ flex: 2 }}
          />
          <input
            value={doseUnit}
            onChange={(e) => setDoseUnit(e.target.value)}
            placeholder={t('sheets.medication.unitPlaceholder')}
            style={{ flex: 1 }}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="interval">{t('sheets.medication.interval')}</label>
        <input
          id="interval"
          type="text"
          inputMode="decimal"
          value={intervalHours}
          onChange={(e) => setIntervalHours(e.target.value)}
        />
      </div>
      {error && <p className="error-text">{error}</p>}
      <button className="btn btn-primary btn-block" disabled={saving} onClick={submit}>
        {saving ? t('common.saving') : t('sheets.medication.submit')}
      </button>
    </Sheet>
  );
}
