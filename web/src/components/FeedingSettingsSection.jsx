import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client.js';
import { t } from '../i18n/index.js';

export function FeedingSettingsSection() {
  const [feedPrompt, setFeedPrompt] = useState(null); // null until loaded
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => setFeedPrompt(s.feedPrompt !== false))
      .catch(() => {});
  }, []);

  async function change(next) {
    setFeedPrompt(next);
    setError(null);
    try {
      await api.updateSettings({ feedPrompt: next });
    } catch (e) {
      setFeedPrompt(!next);
      setError(errorMessage(e));
    }
  }

  if (feedPrompt === null) return null;

  return (
    <>
      <h2 className="section-title">{t('profile.feeding.title')}</h2>
      <div className="card" style={{ marginBottom: 20 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={feedPrompt}
            onChange={(e) => change(e.target.checked)}
            style={{ width: 'auto' }}
          />
          {t('profile.feeding.askAfter')}
        </label>
        <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {t('profile.feeding.hint')}
        </p>
        {error && <p className="error-text">{error}</p>}
      </div>
    </>
  );
}
