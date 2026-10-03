import { useState } from 'react';
import { Sheet } from './Sheet.jsx';
import { api, errorMessage } from '../api/client.js';
import { CONSISTENCY_OPTIONS } from '../lib/diaperOptions.js';
import { AFTER_FEED, FEED_TAGS } from '../lib/breastfeeding.js';
import { hasMessage, t, tOr } from '../i18n/index.js';
import { readNumberField } from '../lib/numberField.js';

function toLocalInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(value) {
  return value ? new Date(value).toISOString() : null;
}

// These events happen at a single moment (startedAt === endedAt always) — unlike
// breastfeeding/outing/contraction/sleep, which genuinely run over a duration.
const INSTANT_TYPES = ['diaper', 'bottle', 'temperature', 'medication'];

export function EditEventSheet({ event, onClose, onSaved, onDeleted }) {
  const isInstant = INSTANT_TYPES.includes(event.type);
  const [startedAt, setStartedAt] = useState(toLocalInputValue(event.startedAt));
  const [endedAt, setEndedAt] = useState(toLocalInputValue(event.endedAt));
  const [details, setDetails] = useState(event.details || {});
  // Numbers are edited as the raw text typed and parsed on save (a comma or a point both work).
  const [numText, setNumText] = useState(() => {
    const d = event.details || {};
    return {
      volumeMl: String(d.volumeMl ?? ''),
      valueC: String(d.valueC ?? ''),
      doseAmount: String(d.doseAmount ?? ''),
      intervalHours: String(d.intervalHours ?? ''),
    };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function setDetail(key, value) {
    setDetails((d) => ({ ...d, [key]: value }));
  }

  function setNum(key, value) {
    setNumText((n) => ({ ...n, [key]: value }));
  }

  // Parses the number fields of this event type into a copy of `details`; null when one is invalid.
  function detailsWithNumbers() {
    const next = { ...details };
    const checks = [];
    if (event.type === 'bottle') {
      checks.push(['volumeMl', { required: true, min: 0, minExclusive: true }]);
    } else if (event.type === 'temperature') {
      checks.push(['valueC', { required: true }]);
    } else if (event.type === 'medication') {
      checks.push(['doseAmount', { min: 0 }], ['intervalHours', { required: true, min: 0 }]);
    }
    for (const [key, rules] of checks) {
      const field = readNumberField(numText[key], rules);
      if (field.invalid) return null;
      next[key] = field.value;
    }
    return next;
  }

  async function save() {
    const nextDetails = detailsWithNumbers();
    if (!nextDetails) {
      setError(t('sheets.invalidNumber'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.updateEvent(event.id, {
        startedAt: fromLocalInputValue(startedAt),
        endedAt: isInstant ? fromLocalInputValue(startedAt) : fromLocalInputValue(endedAt),
        details: nextDetails,
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
      await api.deleteEvent(event.id);
      onDeleted();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={hasMessage(`editEvent.title.${event.type}`) ? t(`editEvent.title.${event.type}`) : t('editEvent.titleGeneric')}
      onClose={onClose}
    >
      <div className="field">
        <label>{isInstant ? t('editEvent.dateTime') : t('editEvent.startedAt')}</label>
        <input type="datetime-local" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
      </div>
      {!isInstant && (
        <div className="field">
          <label>{t('editEvent.endedAt')}</label>
          <input type="datetime-local" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} />
        </div>
      )}

      {event.type === 'diaper' && (
        <>
          <div className="choice-row">
            <button
              type="button"
              className={`choice-btn${details.wet ? ' selected' : ''}`}
              onClick={() => setDetail('wet', !details.wet)}
            >
              {t('sheets.diaper.wet')}
            </button>
            <button
              type="button"
              className={`choice-btn${details.dirty ? ' selected' : ''}`}
              onClick={() => setDetail('dirty', !details.dirty)}
            >
              {t('sheets.diaper.dirty')}
            </button>
          </div>
          {details.dirty && (
            <>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {t('editEvent.consistency')}
              </label>
              <div className="choice-row" style={{ marginTop: 6 }}>
                {CONSISTENCY_OPTIONS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={`choice-btn${details.consistency === c.key ? ' selected' : ''}`}
                    onClick={() =>
                      setDetail('consistency', details.consistency === c.key ? null : c.key)
                    }
                  >
                    {t(c.labelKey)}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {event.type === 'bottle' && (
        <>
          <div className="field">
            <label>{t('editEvent.volume')}</label>
            <input
              type="text"
              inputMode="decimal"
              value={numText.volumeMl}
              onChange={(e) => setNum('volumeMl', e.target.value)}
            />
          </div>
          <div className="choice-row">
            {['formula', 'breast_milk', 'mixed'].map((c) => (
              <button
                key={c}
                type="button"
                className={`choice-btn${details.contents === c ? ' selected' : ''}`}
                onClick={() => setDetail('contents', c)}
              >
                {tOr('sheets.bottle.contents', c)}
              </button>
            ))}
          </div>
        </>
      )}

      {event.type === 'breastfeeding' && (
        <>
          <div className="choice-row">
            {['left', 'right', 'both'].map((s) => (
              <button
                key={s}
                type="button"
                className={`choice-btn${details.side === s ? ' selected' : ''}`}
                onClick={() =>
                  setDetails((d) => {
                    const next = { ...d, side: s };
                    // The starting side only means something for a feed on both sides.
                    if (s !== 'both') delete next.firstSide;
                    return next;
                  })
                }
              >
                {tOr('side', s)}
              </button>
            ))}
          </div>
          {details.side === 'both' && (
            <>
              <label style={{ display: 'block', margin: '12px 0 6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {t('editEvent.startedWith')}
              </label>
              <div className="choice-row">
                {['left', 'right'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`choice-btn${details.firstSide === s ? ' selected' : ''}`}
                    onClick={() =>
                      setDetail('firstSide', details.firstSide === s ? undefined : s)
                    }
                  >
                    {tOr('side', s)}
                  </button>
                ))}
              </div>
            </>
          )}
          <label style={{ display: 'block', margin: '12px 0 6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {t('editEvent.howItWent')}
          </label>
          <div className="choice-row" style={{ flexWrap: 'wrap' }}>
            {FEED_TAGS.map((tag) => {
              const tags = Array.isArray(details.tags) ? details.tags : [];
              const on = tags.includes(tag.key);
              return (
                <button
                  key={tag.key}
                  type="button"
                  className={`choice-btn${on ? ' selected' : ''}`}
                  onClick={() => {
                    const next = on ? tags.filter((k) => k !== tag.key) : [...tags, tag.key];
                    setDetail('tags', next.length ? next : undefined);
                  }}
                >
                  {t(tag.labelKey)}
                </button>
              );
            })}
          </div>
          <div className="choice-row" style={{ marginTop: 8 }}>
            {AFTER_FEED.map((a) => (
              <button
                key={a.key}
                type="button"
                className={`choice-btn${details.afterFeed === a.key ? ' selected' : ''}`}
                onClick={() => setDetail('afterFeed', details.afterFeed === a.key ? undefined : a.key)}
              >
                {t(a.labelKey)}
              </button>
            ))}
          </div>
        </>
      )}

      {event.type === 'contraction' && (
        <div className="choice-row">
          {['mild', 'moderate', 'strong'].map((s) => (
            <button
              key={s}
              type="button"
              className={`choice-btn${details.intensity === s ? ' selected' : ''}`}
              onClick={() => setDetail('intensity', s)}
            >
              {tOr('editEvent.intensity', s)}
            </button>
          ))}
        </div>
      )}

      {event.type === 'outing' && (
        <div className="field">
          <label>{t('editEvent.location')}</label>
          <input
            value={details.location || ''}
            onChange={(e) => setDetail('location', e.target.value)}
          />
        </div>
      )}

      {event.type === 'temperature' && (
        <>
          <div className="choice-row">
            <button
              type="button"
              className={`choice-btn${details.who === 'baby' ? ' selected' : ''}`}
              onClick={() => setDetail('who', 'baby')}
            >
              {t('editEvent.who.baby')}
            </button>
            <button
              type="button"
              className={`choice-btn${details.who === 'mom' ? ' selected' : ''}`}
              onClick={() => setDetail('who', 'mom')}
            >
              {t('editEvent.who.mom')}
            </button>
          </div>
          <div className="field">
            <label>{t('editEvent.temperature')}</label>
            <input
              type="text"
              inputMode="decimal"
              value={numText.valueC}
              onChange={(e) => setNum('valueC', e.target.value)}
            />
          </div>
        </>
      )}

      {event.type === 'medication' && (
        <>
          <div className="field">
            <label>{t('editEvent.name')}</label>
            <input value={details.name || ''} onChange={(e) => setDetail('name', e.target.value)} />
          </div>
          <div className="field">
            <label>{t('editEvent.doseAmount')}</label>
            <input
              type="text"
              inputMode="decimal"
              value={numText.doseAmount}
              onChange={(e) => setNum('doseAmount', e.target.value)}
            />
          </div>
          <div className="field">
            <label>{t('editEvent.doseUnit')}</label>
            <input
              value={details.doseUnit || ''}
              onChange={(e) => setDetail('doseUnit', e.target.value)}
            />
          </div>
          <div className="field">
            <label>{t('editEvent.interval')}</label>
            <input
              type="text"
              inputMode="decimal"
              value={numText.intervalHours}
              onChange={(e) => setNum('intervalHours', e.target.value)}
            />
          </div>
        </>
      )}

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
