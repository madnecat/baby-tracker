import { useState } from 'react';
import { Sheet } from './Sheet.jsx';
import { api, errorMessage } from '../api/client.js';
import { CONSISTENCY_OPTIONS } from '../lib/diaperOptions.js';
import { t } from '../i18n/index.js';

export function DiaperSheet({ onClose, onSaved }) {
  const [wet, setWet] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [consistency, setConsistency] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      await api.createEvent({
        type: 'diaper',
        startedAt: now,
        endedAt: now,
        details: { wet, dirty, consistency: dirty ? consistency : null },
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <Sheet title={t('sheets.diaper.title')} onClose={onClose}>
      <div className="choice-row">
        <button
          type="button"
          className={`choice-btn${wet ? ' selected' : ''}`}
          onClick={() => setWet((v) => !v)}
        >
          {t('sheets.diaper.wet')}
        </button>
        <button
          type="button"
          className={`choice-btn${dirty ? ' selected' : ''}`}
          onClick={() => setDirty((v) => !v)}
        >
          {t('sheets.diaper.dirty')}
        </button>
      </div>

      {dirty && (
        <>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {t('sheets.diaper.consistencyOptional')}
          </label>
          <div className="choice-row" style={{ marginTop: 6 }}>
            {CONSISTENCY_OPTIONS.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`choice-btn${consistency === c.key ? ' selected' : ''}`}
                onClick={() => setConsistency((v) => (v === c.key ? null : c.key))}
              >
                {t(c.labelKey)}
              </button>
            ))}
          </div>
        </>
      )}

      {error && <p className="error-text">{error}</p>}
      <button className="btn btn-primary btn-block" disabled={saving} onClick={submit}>
        {saving ? t('common.saving') : t('sheets.diaper.submit')}
      </button>
    </Sheet>
  );
}
