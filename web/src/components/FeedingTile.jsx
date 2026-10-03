import { useEffect, useState } from 'react';
import { EventTile } from './EventTile.jsx';
import { Sheet } from './Sheet.jsx';
import { BottleSheet } from './BottleSheet.jsx';
import { FeedQualitySheet } from './FeedQualitySheet.jsx';
import { api, errorMessage } from '../api/client.js';
import { t } from '../i18n/index.js';
import { EVENT_COLORS } from '../lib/palette.js';
import { formatDuration } from '../lib/dateUtils.js';
import { describeSides, lastFinishedFeed, suggestNextSide } from '../lib/breastfeeding.js';

const SIDE_CHOICES = [
  { key: 'left', labelKey: 'side.left' },
  { key: 'right', labelKey: 'side.right' },
  { key: 'both', labelKey: 'side.both' },
];
const FIRST_SIDE_CHOICES = SIDE_CHOICES.filter((c) => c.key !== 'both');
// Only the last week is fetched: older feeds can't produce a suggestion anyway.
const LAST_FEED_LOOKBACK_MS = 7 * 86400000;

export function FeedingTile({ onChange }) {
  const [active, setActive] = useState(undefined);
  const [tick, setTick] = useState(0);
  const [choosing, setChoosing] = useState(false);
  const [pickingSide, setPickingSide] = useState(false);
  const [pickingFirstSide, setPickingFirstSide] = useState(false);
  const [loggingBottle, setLoggingBottle] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [stopFailed, setStopFailed] = useState(false);
  const [lastFeed, setLastFeed] = useState(null);
  // Off until the household setting has loaded, so a fast Stop never shows a question that is turned off.
  const [askQuality, setAskQuality] = useState(false);
  // The feed that was just stopped, as the server returned it (see FeedQualitySheet).
  const [justStopped, setJustStopped] = useState(null);

  useEffect(() => {
    api.activeEvent('breastfeeding').then(setActive);
    api
      .getSettings()
      .then((s) => setAskQuality(s.feedPrompt !== false))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [active]);

  function openSidePicker() {
    setError(null);
    setLastFeed(null);
    setPickingSide(true);
    // Never blocks starting a feed: the three buttons render immediately, and the "last feed"
    // line only appears if this request comes back.
    const from = new Date(Date.now() - LAST_FEED_LOOKBACK_MS).toISOString();
    api
      .listEvents({ type: 'breastfeeding', from })
      .then((events) => setLastFeed(lastFinishedFeed(events)))
      .catch(() => {});
  }

  async function startBreastfeeding(side, firstSide) {
    setBusy(true);
    setError(null);
    try {
      const event = await api.createEvent({
        type: 'breastfeeding',
        startedAt: new Date().toISOString(),
        endedAt: null,
        details: side === 'both' && firstSide ? { side, firstSide } : { side },
      });
      setActive(event);
      setPickingSide(false);
      setPickingFirstSide(false);
      onChange?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function stopBreastfeeding() {
    setBusy(true);
    try {
      const stopped = await api.updateEvent(active.id, { endedAt: new Date().toISOString() });
      setActive(null);
      onChange?.();
      if (askQuality) setJustStopped(stopped);
    } catch (e) {
      // The feed is still running; the tile keeps showing Stop so it can be tried again.
      setError(t('tiles.feeding.stopFailedError', { error: errorMessage(e) }));
      setStopFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const suggested = suggestNextSide(lastFeed);
  const choiceLabel = (c) =>
    suggested === c.key ? t('tiles.feeding.suggestedChoice', { label: t(c.labelKey) }) : t(c.labelKey);

  // While a feed is running, "Left, then Right" would be wrong (it hasn't switched yet), so a
  // "both" feed reads "Both (Left first)" until it is finished.
  const activeSide = active?.details?.side;
  const activeFirst = active?.details?.firstSide;
  const sideText =
    activeSide === 'both' && activeFirst
      ? t('tiles.feeding.bothFirst', { side: t(`feed.sideInline.${activeFirst === 'left' ? 'left' : 'right'}`) })
      : activeSide
        ? describeSides(active.details)
        : null;
  const duration = active ? formatDuration(active.startedAt) : '';
  const sub = active
    ? sideText
      ? t('tiles.subWithDuration', { detail: sideText, duration })
      : duration
    : undefined;

  return (
    <>
      <EventTile
        icon={active ? '⏹' : '🍽️'}
        label={active ? t('tiles.feeding.stopLabel') : t('tiles.feeding.label')}
        sub={sub}
        color={EVENT_COLORS.breastfeeding}
        running={!!active}
        onClick={() => {
          if (busy) return;
          if (active) stopBreastfeeding();
          else setChoosing(true);
        }}
      />

      {stopFailed && (
        <Sheet
          title={t('tiles.feeding.stopFailedTitle')}
          onClose={() => {
            setStopFailed(false);
            setError(null);
          }}
        >
          <p className="error-text" style={{ marginTop: 0 }}>
            {error}
          </p>
          <button
            className="btn btn-primary btn-block"
            onClick={() => {
              setStopFailed(false);
              setError(null);
            }}
          >
            {t('tiles.feeding.tryAgain')}
          </button>
        </Sheet>
      )}

      {choosing && (
        <Sheet title={t('tiles.feeding.logTitle')} onClose={() => setChoosing(false)}>
          <div className="choice-row">
            <button
              type="button"
              className="choice-btn"
              onClick={() => {
                setChoosing(false);
                openSidePicker();
              }}
            >
              {t('tiles.feeding.breastfeeding')}
            </button>
            <button
              type="button"
              className="choice-btn"
              onClick={() => {
                setChoosing(false);
                setLoggingBottle(true);
              }}
            >
              {t('tiles.feeding.bottle')}
            </button>
          </div>
        </Sheet>
      )}

      {pickingSide && (
        <Sheet title={t('tiles.feeding.whichSide')} onClose={() => setPickingSide(false)}>
          {lastFeed && (
            <p style={{ marginTop: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {suggested
                ? t('tiles.feeding.lastFeedSuggested', {
                    sides: describeSides(lastFeed.details),
                    ago: t('time.ago', { duration: formatDuration(lastFeed.endedAt) }),
                    side: t(suggested === 'left' ? 'side.left' : 'side.right'),
                  })
                : t('tiles.feeding.lastFeed', {
                    sides: describeSides(lastFeed.details),
                    ago: t('time.ago', { duration: formatDuration(lastFeed.endedAt) }),
                  })}
            </p>
          )}
          <div className="choice-row">
            {SIDE_CHOICES.map((c) => (
              <button
                key={c.key}
                type="button"
                className="choice-btn"
                disabled={busy}
                onClick={() => {
                  if (c.key === 'both') {
                    setPickingSide(false);
                    setPickingFirstSide(true);
                  } else {
                    startBreastfeeding(c.key);
                  }
                }}
              >
                {choiceLabel(c)}
              </button>
            ))}
          </div>
          {error && <p className="error-text">{error}</p>}
        </Sheet>
      )}

      {pickingFirstSide && (
        <Sheet title={t('tiles.feeding.whichSideFirst')} onClose={() => setPickingFirstSide(false)}>
          <div className="choice-row">
            {FIRST_SIDE_CHOICES.map((c) => (
              <button
                key={c.key}
                type="button"
                className="choice-btn"
                disabled={busy}
                onClick={() => startBreastfeeding('both', c.key)}
              >
                {choiceLabel(c)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-block"
            style={{ marginTop: 12 }}
            disabled={busy}
            onClick={() => startBreastfeeding('both')}
          >
            {t('tiles.feeding.notSure')}
          </button>
          {error && <p className="error-text">{error}</p>}
        </Sheet>
      )}

      {loggingBottle && (
        <BottleSheet
          onClose={() => setLoggingBottle(false)}
          onSaved={() => {
            setLoggingBottle(false);
            onChange?.();
          }}
        />
      )}

      {justStopped && (
        <FeedQualitySheet
          event={justStopped}
          onClose={() => setJustStopped(null)}
          onSaved={() => {
            setJustStopped(null);
            onChange?.();
          }}
        />
      )}
    </>
  );
}
