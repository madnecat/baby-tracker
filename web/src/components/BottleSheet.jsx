import { useState } from 'react';
import { Sheet } from './Sheet.jsx';
import { api, errorMessage } from '../api/client.js';
import { t, tOr } from '../i18n/index.js';
import { parseDecimal } from '../lib/parseDecimal.js';
import { readNumberField } from '../lib/numberField.js';

const PRESETS = [30, 60, 90, 120, 150];

export function BottleSheet({ onClose, onSaved }) {
  // Raw text as typed (so a half-typed "2," survives a keystroke); parsed only on submit.
  const [volumeMl, setVolumeMl] = useState('90');
  const [contents, setContents] = useState('formula');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    const volume = readNumberField(volumeMl, { required: true, min: 0, minExclusive: true });
    if (volume.invalid) {
      setError(t('sheets.invalidNumber'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      await api.createEvent({
        type: 'bottle',
        startedAt: now,
        endedAt: now,
        details: { volumeMl: volume.value, contents },
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <Sheet title={t('sheets.bottle.title')} onClose={onClose}>
      <div className="choice-row">
        {PRESETS.map((v) => (
          <button
            key={v}
            type="button"
            className={`choice-btn${parseDecimal(volumeMl) === v ? ' selected' : ''}`}
            onClick={() => setVolumeMl(String(v))}
          >
            {t('sheets.bottle.preset', { volume: v })}
          </button>
        ))}
      </div>
      <div className="field">
        <label htmlFor="volume">{t('sheets.bottle.volume')}</label>
        <input
          id="volume"
          type="text"
          inputMode="decimal"
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
            {tOr('sheets.bottle.contents', c)}
          </button>
        ))}
      </div>
      {error && <p className="error-text">{error}</p>}
      <button className="btn btn-primary btn-block" disabled={saving} onClick={submit}>
        {saving ? t('common.saving') : t('sheets.bottle.submit')}
      </button>
    </Sheet>
  );
}
