import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client.js';
import { t } from '../i18n/index.js';
import { tRich } from '../i18n/rich.jsx';
import { formatDateTime } from '../lib/dateUtils.js';

const MCP_URL = `${window.location.origin}/mcp`;

export function ApiTokensSection() {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState(null);
  const [error, setError] = useState(null);

  function load() {
    setLoading(true);
    api
      .listApiTokens()
      .then(setTokens)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function create(e) {
    e.preventDefault();
    if (!label.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const { token } = await api.createApiToken(label.trim());
      setNewToken(token);
      setLabel('');
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id) {
    await api.revokeApiToken(id);
    load();
  }

  return (
    <>
      <h2 className="section-title">{t('apiTokens.title')}</h2>
      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ marginTop: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {t('apiTokens.intro')}
        </p>

        {newToken && (
          <div className="warning-banner" style={{ borderLeftColor: 'var(--accent)' }}>
            🔑{' '}
            <span>
              <strong>{t('apiTokens.copyNow')}</strong>
              <br />
              <code style={{ wordBreak: 'break-all', userSelect: 'all' }}>{newToken}</code>
              <br />
              <br />
              {tRich('apiTokens.inClaude', { path: <strong>{t('apiTokens.connectorPath')}</strong> })}
              <br />
              {tRich('apiTokens.url', { url: <code style={{ wordBreak: 'break-all' }}>{MCP_URL}</code> })}
              <br />
              {tRich('apiTokens.header', {
                name: <code>Authorization</code>,
                value: <code>Bearer </code>,
              })}
            </span>
          </div>
        )}

        <form onSubmit={create} className="btn-row" style={{ marginBottom: 4 }}>
          <input
            placeholder={t('apiTokens.labelPlaceholder')}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--page)',
              color: 'var(--text-primary)',
            }}
          />
          <button className="btn btn-primary" disabled={creating}>
            {creating ? '…' : t('apiTokens.create')}
          </button>
        </form>
        {error && <p className="error-text">{error}</p>}
      </div>

      {!loading && tokens.length > 0 && (
        <div className="card">
          {tokens.map((tok) => (
            <div
              key={tok.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: '1px solid var(--gridline)',
              }}
            >
              <div>
                <div>{tok.label}</div>
                <div className="time">
                  {tok.lastUsedAt
                    ? t('apiTokens.createdUsed', {
                        created: formatDateTime(tok.createdAt),
                        used: formatDateTime(tok.lastUsedAt),
                      })
                    : t('apiTokens.createdNever', { created: formatDateTime(tok.createdAt) })}
                </div>
              </div>
              <button className="btn btn-danger" onClick={() => revoke(tok.id)}>
                {t('apiTokens.revoke')}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
