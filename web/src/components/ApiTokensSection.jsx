import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
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
      setError(err.message);
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
      <h2 className="section-title">AI assistant access</h2>
      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ marginTop: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Create a token to let Claude log events for you when you describe them in chat (e.g.
          "log a 15 minute breastfeed on the left side from 3pm"). Works with Claude's remote
          custom connectors (claude.ai, Claude Desktop, mobile). ChatGPT isn't supported yet — it
          requires a full OAuth server rather than a simple token.
        </p>

        {newToken && (
          <div className="warning-banner" style={{ borderLeftColor: 'var(--accent)' }}>
            🔑{' '}
            <span>
              <strong>Copy this token now — it won't be shown again:</strong>
              <br />
              <code style={{ wordBreak: 'break-all', userSelect: 'all' }}>{newToken}</code>
              <br />
              <br />
              In Claude: <strong>Settings → Connectors → Add custom connector</strong>
              <br />
              URL: <code style={{ wordBreak: 'break-all' }}>{MCP_URL}</code>
              <br />
              Under the header settings, add: header name <code>Authorization</code>, value{' '}
              <code>Bearer </code> followed directly by the full token above (with a space, no
              line break).
            </span>
          </div>
        )}

        <form onSubmit={create} className="btn-row" style={{ marginBottom: 4 }}>
          <input
            placeholder="Label, e.g. Wife's Claude"
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
            {creating ? '…' : 'Create'}
          </button>
        </form>
        {error && <p className="error-text">{error}</p>}
      </div>

      {!loading && tokens.length > 0 && (
        <div className="card">
          {tokens.map((t) => (
            <div
              key={t.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: '1px solid var(--gridline)',
              }}
            >
              <div>
                <div>{t.label}</div>
                <div className="time">
                  Created {formatDateTime(t.createdAt)}
                  {t.lastUsedAt ? ` · last used ${formatDateTime(t.lastUsedAt)}` : ' · never used'}
                </div>
              </div>
              <button className="btn btn-danger" onClick={() => revoke(t.id)}>
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
