import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { t } from '../i18n/index.js';
import { daysLeftText, formatCalendarDate, summarize, urgencyOf } from '../lib/freezer.js';
import { ThawSheet } from './ThawSheet.jsx';
import { EditBagSheet } from './EditBagSheet.jsx';

const OPEN_KEY = 'bt_freezer_open';

// Per-device convenience only: storage can be missing or throw, and the section works without it.
function readOpen() {
  try {
    return localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

// The freezer stock on the Mum page: a one-line summary (always visible), the bags by the number
// written on them, and the thaw planner. Freezing a bag is logged from the Mum log screen, not here.
// Collapsed to the summary by default.
export function FreezerSection() {
  const [freezer, setFreezer] = useState(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(readOpen);
  const [sheet, setSheet] = useState(null); // 'thaw' | { edit: bag }

  function load() {
    api
      .getFreezer()
      .then((data) => {
        setFreezer(data);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }
  useEffect(load, []);
  // Day counts come from the server: refresh them when the tab comes back (e.g. a page left open overnight).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, next ? '1' : '0');
    } catch {
      // Not remembered; the section still works.
    }
  }

  // A failed load never shows a false "empty freezer": it says so and offers to retry.
  if (!freezer) {
    if (!failed) return null;
    return (
      <>
        <h2 className="section-title">{t('freezer.title')}</h2>
        <div className="card" style={{ marginBottom: 20 }}>
          <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)' }}>{t('freezer.loadFailed')}</p>
          <button className="btn btn-block" onClick={load}>
            {t('freezer.retry')}
          </button>
        </div>
      </>
    );
  }

  const summary = summarize(freezer.bags);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 className="section-title">{t('freezer.title')}</h2>
        {summary.count > 0 && (
          <button type="button" className="chip" onClick={toggle} aria-expanded={open}>
            {open ? t('freezer.hide') : t('freezer.show')}
          </button>
        )}
      </div>
      <div className="card" style={{ marginBottom: 20 }}>
        {summary.count === 0 ? (
          <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)' }}>{t('freezer.empty')}</p>
        ) : (
          <p style={{ margin: '0 0 12px', fontWeight: 600 }}>
            {t('freezer.summary', { count: summary.count, ml: summary.totalMl })}
            <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>
              {' · '}
              {t('freezer.nextExpiry', { date: formatCalendarDate(summary.nextExpiryOn) })}
            </span>
          </p>
        )}

        {open && summary.count > 0 && (
          <div style={{ marginBottom: 12 }}>
            {freezer.bags.map((bag) => (
              <div className="history-item" key={bag.id} onClick={() => setSheet({ edit: bag })}>
                <div className="details">
                  <div>
                    <strong>{t('freezer.bag.number', { ref: bag.reference })}</strong>
                    {' — '}
                    {t('freezer.bag.meta', { ml: bag.quantityMl, frozen: formatCalendarDate(bag.frozenOn) })}
                  </div>
                  <div className={`time freezer-${urgencyOf(bag.daysLeft)}`}>
                    {t('freezer.bag.expires', { date: formatCalendarDate(bag.expiresOn) })}
                    {' · '}
                    {daysLeftText(bag.daysLeft)}
                  </div>
                  {bag.notes && <div className="time">{bag.notes}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        <button className="btn btn-primary btn-block" disabled={summary.count === 0} onClick={() => setSheet('thaw')}>
          {t('freezer.thaw')}
        </button>
      </div>

      {sheet === 'thaw' && <ThawSheet onClose={() => setSheet(null)} onChanged={load} />}
      {sheet?.edit && (
        <EditBagSheet
          bag={sheet.edit}
          onClose={() => setSheet(null)}
          onRefresh={load}
          onChanged={() => {
            setSheet(null);
            load();
          }}
        />
      )}
    </>
  );
}
