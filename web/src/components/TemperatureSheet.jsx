import { useState } from 'react';
import { Sheet } from './Sheet.jsx';
import { api, errorMessage } from '../api/client.js';
import { t } from '../i18n/index.js';
import { readNumberField } from '../lib/numberField.js';

export function TemperatureSheet({ who, onClose, onSaved }) {
  const [valueC, setValueC] = useState('37.0');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    const temperature = readNumberField(valueC, { required: true });
    if (temperature.invalid) {
      setError(t('sheets.invalidNumber'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      await api.createEvent({
        type: 'temperature',
        startedAt: now,
        endedAt: now,
        details: { who, valueC: temperature.value, notes: notes || null },
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <Sheet
      title={who === 'mom' ? t('sheets.temperature.titleMom') : t('sheets.temperature.titleBaby')}
      onClose={onClose}
    >
      <div className="field">
        <label htmlFor="temp">{t('sheets.temperature.label')}</label>
        <input
          id="temp"
          type="text"
          inputMode="decimal"
          value={valueC}
          onChange={(e) => setValueC(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="tempnotes">{t('sheets.notesOptional')}</label>
        <input id="tempnotes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {error && <p className="error-text">{error}</p>}
      <button className="btn btn-primary btn-block" disabled={saving} onClick={submit}>
        {saving ? t('common.saving') : t('sheets.temperature.submit')}
      </button>
    </Sheet>
  );
}
