import { useState } from 'react';
import { Sheet } from './Sheet.jsx';
import { api, errorMessage } from '../api/client.js';
import { t } from '../i18n/index.js';
import { SHELF_LIFE_MONTHS, addMonths, formatCalendarDate, readWholeMl } from '../lib/freezer.js';

const MAX_BAG_ML = 500;

// A bag that is still in the freezer: thaw it by hand, fix it (a wrong quantity, a different
// number…), or throw it away. `onRefresh` reloads the list without closing the sheet.
export function EditBagSheet({ bag, onClose, onChanged, onRefresh }) {
  const [thawState, setThawState] = useState(null); // null | 'thawed' | 'undone'
  const [quantity, setQuantity] = useState(String(bag.quantityMl));
  const [frozenOn, setFrozenOn] = useState(bag.frozenOn);
  const [expiresOn, setExpiresOn] = useState(bag.expiresOn);
  const [reference, setReference] = useState(String(bag.reference));
  const [notes, setNotes] = useState(bag.notes || '');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function run(action) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  function save() {
    const ml = readWholeMl(quantity, MAX_BAG_ML);
    if (ml === null) {
      setError(t('freezer.freeze.invalidQuantity'));
      return;
    }
    const ref = readWholeMl(reference);
    if (ref === null) {
      setError(t('freezer.freeze.invalidReference'));
      return;
    }
    // Only what changed is sent: changing the freezing date alone moves the expiry with it.
    const patch = {};
    if (ml !== bag.quantityMl) patch.quantityMl = ml;
    if (ref !== bag.reference) patch.reference = ref;
    if (frozenOn !== bag.frozenOn) patch.frozenOn = frozenOn;
    if (expiresOn !== bag.expiresOn) patch.expiresOn = expiresOn;
    if (notes.trim() !== (bag.notes || '')) patch.notes = notes.trim();
    return run(() => api.updateFreezerBag(bag.id, patch));
  }

  // Thawing this one bag by hand, whatever the planner would have suggested.
  async function thawThis() {
    setBusy(true);
    setError(null);
    try {
      await api.thawFreezerBags([bag.id]);
      setThawState('thawed');
      onRefresh?.();
    } catch (e) {
      setError(errorMessage(e));
      onRefresh?.();
    } finally {
      setBusy(false);
    }
  }

  async function undoThaw() {
    setBusy(true);
    setError(null);
    try {
      await api.undoFreezerThaw([bag.id]);
      setThawState('undone');
      onRefresh?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (thawState) {
    return (
      <Sheet title={t('freezer.edit.title', { ref: bag.reference })} onClose={onClose}>
        {thawState === 'undone' ? (
          <p>{t('freezer.thawSheet.undone')}</p>
        ) : (
          <>
            <p style={{ fontSize: '1.15rem', fontWeight: 700 }}>
              {t('freezer.thawSheet.thawed', { count: 1, refs: bag.reference })}
            </p>
            <p style={{ color: 'var(--text-secondary)' }}>{t('freezer.thawSheet.thawedHint')}</p>
          </>
        )}
        {error && <p className="error-text">{error}</p>}
        <div className="btn-row">
          {thawState === 'thawed' && (
            <button className="btn btn-block" disabled={busy} onClick={undoThaw}>
              {t('freezer.thawSheet.undo')}
            </button>
          )}
          <button className="btn btn-primary btn-block" onClick={onClose}>
            {t('freezer.thawSheet.close')}
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title={t('freezer.edit.title', { ref: bag.reference })} onClose={onClose}>
      <button className="btn btn-primary btn-block" disabled={busy} onClick={thawThis} style={{ marginBottom: 16 }}>
        {t('freezer.edit.thaw')}
      </button>
      <div className="field">
        <label htmlFor="editBagQuantity">{t('freezer.freeze.quantity')}</label>
        <input
          id="editBagQuantity"
          type="text"
          inputMode="numeric"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="editBagReference">{t('freezer.freeze.reference')}</label>
        <input
          id="editBagReference"
          type="text"
          inputMode="numeric"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="editBagFrozen">{t('freezer.freeze.date')}</label>
        <input
          id="editBagFrozen"
          type="date"
          value={frozenOn}
          onChange={(e) => {
            setFrozenOn(e.target.value);
            // The expiry follows the freezing date (the server does the same), so what is on screen is what gets saved.
            if (e.target.value) setExpiresOn(addMonths(e.target.value, SHELF_LIFE_MONTHS));
          }}
        />
      </div>
      <div className="field">
        <label htmlFor="editBagExpires">{t('freezer.bag.expires', { date: formatCalendarDate(expiresOn) })}</label>
        <input id="editBagExpires" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="editBagNotes">{t('freezer.freeze.notes')}</label>
        <input
          id="editBagNotes"
          type="text"
          maxLength={200}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      {error && <p className="error-text">{error}</p>}
      <button className="btn btn-block" disabled={busy} onClick={save}>
        {busy ? t('common.saving') : t('freezer.edit.submit')}
      </button>
      <div style={{ height: 10 }} />
      {confirmDiscard ? (
        <div className="btn-row">
          <button className="btn btn-block" disabled={busy} onClick={() => setConfirmDiscard(false)}>
            {t('freezer.edit.cancel')}
          </button>
          <button
            className="btn btn-danger btn-block"
            disabled={busy}
            onClick={() => run(() => api.discardFreezerBag(bag.id))}
          >
            {t('freezer.edit.confirmDiscard')}
          </button>
        </div>
      ) : (
        <button className="btn btn-block" disabled={busy} onClick={() => setConfirmDiscard(true)}>
          {t('freezer.edit.discard')}
        </button>
      )}
    </Sheet>
  );
}
