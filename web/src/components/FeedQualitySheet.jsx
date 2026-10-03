import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sheet } from './Sheet.jsx';
import { api, errorMessage } from '../api/client.js';
import { AFTER_FEED, FEED_TAGS } from '../lib/breastfeeding.js';
import { t } from '../i18n/index.js';
import { tRich } from '../i18n/rich.jsx';

/**
 * Optional "how did it go?" after a breastfeed is stopped. `event` is the finished feed exactly
 * as the server returned it from the Stop request, so the details saved here are built from that
 * (the PATCH replaces `details` wholesale — sending only the new keys would erase the side). It is
 * a snapshot taken at Stop time, never the live timer, so a feed started while this is open can't
 * receive these notes. Closing in any way other than Save is a skip and writes nothing.
 */
export function FeedQualitySheet({ event, onClose, onSaved }) {
  const [tags, setTags] = useState([]);
  const [afterFeed, setAfterFeed] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const nothingChosen = tags.length === 0 && !afterFeed;

  function toggleTag(key) {
    setTags((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const details = { ...event.details };
      if (tags.length > 0) details.tags = tags;
      if (afterFeed) details.afterFeed = afterFeed;
      await api.updateEvent(event.id, { details });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <Sheet title={t('sheets.feedQuality.title')} onClose={onClose}>
      <p style={{ marginTop: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        {t('sheets.feedQuality.hint')}
      </p>
      <div className="choice-row" style={{ flexWrap: 'wrap' }}>
        {FEED_TAGS.map((tag) => (
          <button
            key={tag.key}
            type="button"
            className={`choice-btn${tags.includes(tag.key) ? ' selected' : ''}`}
            onClick={() => toggleTag(tag.key)}
          >
            {t(tag.labelKey)}
          </button>
        ))}
      </div>

      <label style={{ display: 'block', margin: '14px 0 6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        {t('sheets.feedQuality.afterwards')}
      </label>
      <div className="choice-row">
        {AFTER_FEED.map((a) => (
          <button
            key={a.key}
            type="button"
            className={`choice-btn${afterFeed === a.key ? ' selected' : ''}`}
            onClick={() => setAfterFeed(afterFeed === a.key ? null : a.key)}
          >
            {t(a.labelKey)}
          </button>
        ))}
      </div>

      {error && <p className="error-text">{error}</p>}
      <div className="btn-row" style={{ marginTop: 16 }}>
        <button className="btn btn-block" disabled={saving} onClick={onClose}>
          {t('common.skip')}
        </button>
        <button className="btn btn-primary btn-block" disabled={saving || nothingChosen} onClick={save}>
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>
      <p style={{ margin: '12px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        {tRich('sheets.feedQuality.footnote', {
          link: <Link to="/settings">{t('sheets.feedQuality.settingsLink')}</Link>,
        })}
      </p>
    </Sheet>
  );
}
