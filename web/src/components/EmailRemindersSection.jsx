import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client.js';
import { t } from '../i18n/index.js';

const hint = { marginTop: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' };

// The language of the reminder emails is the person's app language, stored on their account and
// used by the server — nothing about language is sent from here.
export function EmailRemindersSection() {
  const [info, setInfo] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(null); // 'save' | 'test' | 'ask'
  const [status, setStatus] = useState(null);

  function apply(data) {
    setInfo(data);
    setEnabled(data.enabled);
    setEmail(data.email);
  }

  useEffect(() => {
    api
      .getNotifications()
      .then(apply)
      .catch(() => setInfo(null));
  }, []);

  async function run(kind, action, okMessageKey) {
    setBusy(kind);
    setStatus(null);
    try {
      const result = await action();
      if (result) apply({ ...info, ...result });
      setStatus({ ok: true, message: t(okMessageKey) });
    } catch (err) {
      setStatus({ ok: false, message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  const save = (e) => {
    e.preventDefault();
    return run('save', () => api.updateNotifications({ enabled, email }), 'emailReminders.saved');
  };

  if (!info) return null;

  const dirty = enabled !== info.enabled || email.trim() !== info.email;

  return (
    <>
      <h2 className="section-title">{t('emailReminders.title')}</h2>
      <div className="card" style={{ marginBottom: 20 }}>
        {!info.available ? (
          <p style={{ ...hint, marginBottom: 0 }}>{t('emailReminders.unavailable')}</p>
        ) : (
          <>
            <p style={hint}>{t('emailReminders.hint')}</p>
            <form onSubmit={save}>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    style={{ width: 'auto' }}
                  />
                  {t('emailReminders.enable')}
                </label>
              </div>
              <div className="field">
                <label htmlFor="reminder-email">{t('emailReminders.emailLabel')}</label>
                <input
                  id="reminder-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder={t('emailReminders.emailPlaceholder')}
                />
              </div>
              {status && <p className={status.ok ? 'success-text' : 'error-text'}>{status.message}</p>}
              <button className="btn btn-primary btn-block" disabled={busy !== null || !dirty}>
                {busy === 'save' ? t('common.saving') : t('common.save')}
              </button>
            </form>
            <button
              type="button"
              className="btn btn-block"
              style={{ marginTop: 8 }}
              disabled={busy !== null || dirty || !info.email}
              onClick={() => run('test', () => api.sendTestEmail(), 'emailReminders.testSent')}
            >
              {busy === 'test' ? t('common.sending') : t('emailReminders.sendTest')}
            </button>

            {!info.momConfigured && (
              <div style={{ marginTop: 16 }}>
                <p style={hint}>{t('emailReminders.momNotSetUp')}</p>
                {info.canAskAdmin && (
                  <button
                    type="button"
                    className="btn btn-block"
                    disabled={busy !== null}
                    onClick={() => run('ask', () => api.requestMomSetup(), 'emailReminders.requestSent')}
                  >
                    {busy === 'ask' ? t('common.sending') : t('emailReminders.askAdmin')}
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
