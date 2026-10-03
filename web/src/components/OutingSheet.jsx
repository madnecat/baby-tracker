import { useState } from 'react';
import { Sheet } from './Sheet.jsx';
import { api, errorMessage } from '../api/client.js';
import { t } from '../i18n/index.js';

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
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <Sheet title={t('sheets.outing.title')} onClose={onClose}>
      <div className="field">
        <label htmlFor="location">{t('sheets.outing.location')}</label>
        <input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="notes">{t('sheets.notesOptional')}</label>
        <input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {error && <p className="error-text">{error}</p>}
      <button className="btn btn-primary btn-block" disabled={saving} onClick={submit}>
        {saving ? t('common.saving') : t('sheets.outing.submit')}
      </button>
    </Sheet>
  );
}
