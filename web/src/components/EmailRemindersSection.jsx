import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

const hint = { marginTop: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' };

export function EmailRemindersSection() {
  const [info, setInfo] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [email, setEmail] = useState('');
  const [language, setLanguage] = useState('en');
  const [busy, setBusy] = useState(null); // 'save' | 'test' | 'ask'
  const [status, setStatus] = useState(null);

  function apply(data) {
    setInfo(data);
    setEnabled(data.enabled);
    setEmail(data.email);
    setLanguage(data.language);
  }

  useEffect(() => {
    api
      .getNotifications()
      .then(apply)
      .catch(() => setInfo(null));
  }, []);

  async function run(kind, action, okMessage) {
    setBusy(kind);
    setStatus(null);
    try {
      const result = await action();
      if (result) apply({ ...info, ...result });
      setStatus({ ok: true, message: okMessage });
    } catch (err) {
      setStatus({ ok: false, message: err.message });
    } finally {
      setBusy(null);
    }
  }

  const save = (e) => {
    e.preventDefault();
    return run('save', () => api.updateNotifications({ enabled, email, language }), 'Saved.');
  };

  if (!info) return null;

  const dirty = enabled !== info.enabled || email.trim() !== info.email || language !== info.language;

  return (
    <>
      <h2 className="section-title">Email reminders</h2>
      <div className="card" style={{ marginBottom: 20 }}>
        {!info.available ? (
          <p style={{ ...hint, marginBottom: 0 }}>Email reminders are not available on this server.</p>
        ) : (
          <>
            <p style={hint}>
              Get an email when the waiting time between doses of a medication is over. The email
              never names the medication — it only says whether it is for Mum or Baby, with a link
              back here. Mum's reminders go to Mum only; Baby's go to every parent who turns this on.
            </p>
            <form onSubmit={save}>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    style={{ width: 'auto' }}
                  />
                  Email me when a dose can be taken again
                </label>
              </div>
              <div className="field">
                <label htmlFor="reminder-email">Email address</label>
                <input
                  id="reminder-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </div>
              <div className="field">
                <label htmlFor="reminder-language">Email language</label>
                <select
                  id="reminder-language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                </select>
              </div>
              {status && <p className={status.ok ? 'success-text' : 'error-text'}>{status.message}</p>}
              <button className="btn btn-primary btn-block" disabled={busy !== null || !dirty}>
                {busy === 'save' ? 'Saving…' : 'Save'}
              </button>
            </form>
            <button
              type="button"
              className="btn btn-block"
              style={{ marginTop: 8 }}
              disabled={busy !== null || dirty || !info.email}
              onClick={() => run('test', () => api.sendTestEmail(), 'Test email sent.')}
            >
              {busy === 'test' ? 'Sending…' : 'Send test email'}
            </button>

            {!info.momConfigured && (
              <div style={{ marginTop: 16 }}>
                <p style={hint}>
                  Mum isn't set up for this household yet, so Mum's medication reminders can't be
                  sent (Baby's still can). Only the administrator can set this up.
                </p>
                {info.canAskAdmin && (
                  <button
                    type="button"
                    className="btn btn-block"
                    disabled={busy !== null}
                    onClick={() =>
                      run('ask', () => api.requestMomSetup(), 'Request sent to the administrator.')
                    }
                  >
                    {busy === 'ask' ? 'Sending…' : 'Ask the administrator to set it up'}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
