import { useEffect, useState } from 'react';
import { Sheet } from './Sheet.jsx';
import { api, errorMessage } from '../api/client.js';
import { t } from '../i18n/index.js';
import { SHELF_LIFE_MONTHS, addMonths, formatCalendarDate, localToday, readWholeMl } from '../lib/freezer.js';

const MAX_BAG_ML = 500;

// Logs a bag of milk going into the freezer. The next bag number is shown before saving so it can
// be written on the bag. After saving, the sheet offers to freeze another one straight away
// (a pumping session often gives several bags).
export function FreezeBagSheet({ onClose, onSaved }) {
  const [nextReference, setNextReference] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [frozenOn, setFrozenOn] = useState(() => localToday());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);

  function loadNextReference() {
    api
      .getFreezer()
      .then((freezer) => setNextReference(freezer.nextReference))
      .catch(() => setNextReference(null));
  }
  useEffect(loadNextReference, []);

  const shownReference = reference.trim() === '' ? nextReference : Number(reference);
  const expiresOn = frozenOn ? addMonths(frozenOn, SHELF_LIFE_MONTHS) : null;

  async function submit() {
    const ml = readWholeMl(quantity, MAX_BAG_ML);
    if (ml === null) {
      setError(t('freezer.freeze.invalidQuantity'));
      return;
    }
    let chosenReference;
    if (reference.trim() !== '') {
      chosenReference = readWholeMl(reference);
      if (chosenReference === null) {
        setError(t('freezer.freeze.invalidReference'));
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const bag = await api.createFreezerBag({
        quantityMl: ml,
        frozenOn,
        reference: chosenReference,
        notes: notes.trim() || undefined,
      });
      setSaved(bag);
      setQuantity('');
      setReference('');
      setNotes('');
      loadNextReference();
      onSaved?.(bag);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <Sheet title={t('freezer.freeze.title')} onClose={onClose}>
        <p>{t('freezer.freeze.saved', { ref: saved.reference, ml: saved.quantityMl })}</p>
        <p style={{ color: 'var(--text-secondary)' }}>
          {t('freezer.freeze.expiry', { date: formatCalendarDate(saved.expiresOn) })}
        </p>
        <div className="btn-row">
          <button className="btn btn-block" onClick={() => setSaved(null)}>
            {t('freezer.freeze.another')}
          </button>
          <button className="btn btn-primary btn-block" onClick={onClose}>
            {t('freezer.freeze.done')}
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title={t('freezer.freeze.title')} onClose={onClose}>
      {shownReference != null && Number.isInteger(shownReference) && shownReference > 0 && (
        <p style={{ fontWeight: 600 }}>{t('freezer.freeze.willBe', { ref: shownReference })}</p>
      )}
      <div className="field">
        <label htmlFor="freezeQuantity">{t('freezer.freeze.quantity')}</label>
        <input
          id="freezeQuantity"
          type="text"
          inputMode="numeric"
          autoFocus
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="freezeDate">{t('freezer.freeze.date')}</label>
        <input id="freezeDate" type="date" value={frozenOn} onChange={(e) => setFrozenOn(e.target.value)} required />
        {expiresOn && (
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {t('freezer.freeze.expiry', { date: formatCalendarDate(expiresOn) })}
          </span>
        )}
      </div>
      <div className="field">
        <label htmlFor="freezeReference">{t('freezer.freeze.reference')}</label>
        <input
          id="freezeReference"
          type="text"
          inputMode="numeric"
          placeholder={nextReference != null ? String(nextReference) : ''}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="freezeNotes">{t('freezer.freeze.notes')}</label>
        <input
          id="freezeNotes"
          type="text"
          maxLength={200}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      {error && <p className="error-text">{error}</p>}
      <button className="btn btn-primary btn-block" disabled={saving} onClick={submit}>
        {saving ? t('common.saving') : t('freezer.freeze.submit')}
      </button>
    </Sheet>
  );
}
