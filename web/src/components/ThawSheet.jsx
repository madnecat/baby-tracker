import { useState } from 'react';
import { Sheet } from './Sheet.jsx';
import { api, errorMessage } from '../api/client.js';
import { t } from '../i18n/index.js';
import { daysLeftText, listReferences, readWholeMl, urgencyOf } from '../lib/freezer.js';

const MAX_TARGET_ML = 2000;

// "I want a bottle of N ml": asks the server for the best bags, shows them by their written
// number, and marks them as used once confirmed. This is planning only — it never logs a feed.
export function ThawSheet({ onClose, onChanged }) {
  const [target, setTarget] = useState('');
  const [plan, setPlan] = useState(null);
  const [choice, setChoice] = useState(0);
  const [thawed, setThawed] = useState(null);
  const [undone, setUndone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [stale, setStale] = useState(false);

  async function find(event) {
    event?.preventDefault();
    const ml = readWholeMl(target, MAX_TARGET_ML);
    if (ml === null) {
      setError(t('freezer.thawSheet.invalidTarget'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setPlan(await api.planFreezer(ml));
      setChoice(0);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(option) {
    setBusy(true);
    setError(null);
    try {
      const result = await api.thawFreezerBags(option.bagIds);
      setThawed(result.bags);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
      // Someone else thawed one of these bags (or one reached its date): show fresh suggestions.
      if (e?.code === 'FREEZER_BAG_CONFLICT') {
        try {
          setPlan(await api.planFreezer(plan.targetMl));
          setChoice(0);
          setStale(true);
        } catch {
          // The error above is already shown.
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    setBusy(true);
    setError(null);
    try {
      await api.undoFreezerThaw(thawed.map((b) => b.id));
      setUndone(true);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (thawed) {
    const refs = thawed.map((b) => b.reference);
    return (
      <Sheet title={t('freezer.thawSheet.title')} onClose={onClose}>
        {undone ? (
          <p>{t('freezer.thawSheet.undone')}</p>
        ) : (
          <>
            <p style={{ fontSize: '1.15rem', fontWeight: 700 }}>
              {t('freezer.thawSheet.thawed', { count: refs.length, refs: listReferences(refs) })}
            </p>
            <p style={{ color: 'var(--text-secondary)' }}>{t('freezer.thawSheet.thawedHint')}</p>
          </>
        )}
        {error && <p className="error-text">{error}</p>}
        <div className="btn-row">
          {!undone && (
            <button className="btn btn-block" disabled={busy} onClick={undo}>
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

  const option = plan?.options?.[choice];

  return (
    <Sheet title={t('freezer.thawSheet.title')} onClose={onClose}>
      <form onSubmit={find}>
        <div className="field">
          <label htmlFor="thawTarget">{t('freezer.thawSheet.target')}</label>
          <input
            id="thawTarget"
            type="text"
            inputMode="numeric"
            autoFocus
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              setPlan(null);
              setStale(false);
            }}
          />
        </div>
        {!plan && (
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {t('freezer.thawSheet.find')}
          </button>
        )}
      </form>
      {error && <p className="error-text">{error}</p>}
      {stale && plan && <p style={{ color: 'var(--text-secondary)' }}>{t('freezer.thawSheet.stale')}</p>}

      {plan && !option && <p>{t('freezer.thawSheet.nothing')}</p>}

      {plan && plan.options.length > 1 && (
        <div className="range-tabs" style={{ marginBottom: 12 }}>
          {plan.options.map((_, i) => (
            <button key={i} className={i === choice ? 'active' : ''} onClick={() => setChoice(i)}>
              {i === 0 ? t('freezer.thawSheet.suggested') : t('freezer.thawSheet.option', { n: i + 1 })}
            </button>
          ))}
        </div>
      )}

      {plan && option && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
            {t('freezer.thawSheet.take')}
          </div>
          {option.bags.map((bag) => (
            <div key={bag.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <strong>{t('freezer.bag.number', { ref: bag.reference })}</strong>
              <span>
                {t('freezer.thawSheet.bagLine', { ml: bag.quantityMl })}
                {' · '}
                <span className={`freezer-${urgencyOf(bag.daysLeft)}`}>{daysLeftText(bag.daysLeft)}</span>
              </span>
            </div>
          ))}
          <div style={{ marginTop: 8, fontWeight: 600 }}>
            {option.overshootMl > 0
              ? t('freezer.thawSheet.totalExtra', {
                  total: option.totalMl,
                  target: plan.targetMl,
                  extra: option.overshootMl,
                })
              : t('freezer.thawSheet.total', { total: option.totalMl, target: plan.targetMl })}
          </div>
        </div>
      )}

      {plan && !plan.enough && option && (
        <p className="error-text">
          {t('freezer.thawSheet.notEnough', {
            total: option.totalMl,
            missing: plan.targetMl - option.totalMl,
          })}
        </p>
      )}

      {plan && option && option.leavesUrgent.length > 0 && (
        <p className="error-text">
          {t('freezer.thawSheet.leavesUrgent', { refs: listReferences(option.leavesUrgent.map((b) => b.reference)) })}
        </p>
      )}

      {plan && option && (
        <button className="btn btn-primary btn-block" disabled={busy} onClick={() => confirm(option)}>
          {plan.enough ? t('freezer.thawSheet.confirm') : t('freezer.thawSheet.confirmAll')}
        </button>
      )}
    </Sheet>
  );
}
