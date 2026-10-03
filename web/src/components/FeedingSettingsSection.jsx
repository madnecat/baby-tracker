import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

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
      setError(e.message);
    }
  }

  if (feedPrompt === null) return null;

  return (
    <>
      <h2 className="section-title">Feeding</h2>
      <div className="card" style={{ marginBottom: 20 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={feedPrompt}
            onChange={(e) => change(e.target.checked)}
            style={{ width: 'auto' }}
          />
          Ask how a breastfeed went after I stop it
        </label>
        <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          A quick optional question (e.g. "efficient feed", "seemed full") that can be skipped. Applies
          to everyone in your household. You can still add or edit notes from History.
        </p>
        {error && <p className="error-text">{error}</p>}
      </div>
    </>
  );
}
