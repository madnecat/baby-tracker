import { useState } from 'react';
import { useAuth } from '../lib/AuthContext.jsx';
import { api, errorMessage } from '../api/client.js';
import { t } from '../i18n/index.js';
import { tRich } from '../i18n/rich.jsx';
import { ApiTokensSection } from '../components/ApiTokensSection.jsx';
import { ChildProfileSection } from '../components/ChildProfileSection.jsx';
import { EmailRemindersSection } from '../components/EmailRemindersSection.jsx';
import { FeedingSettingsSection } from '../components/FeedingSettingsSection.jsx';
import { LanguageSection } from '../components/LanguageSection.jsx';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  async function changePassword(e) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setStatus({ ok: true });
    } catch (err) {
      setStatus({ ok: false, error: err });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">{t('settings.title')}</h1>

      <div className="card" style={{ marginBottom: 20 }}>
        {tRich('settings.signedInAs', { name: <strong>{user?.displayName}</strong> })}
      </div>

      <LanguageSection />

      <ChildProfileSection />

      <FeedingSettingsSection />

      <EmailRemindersSection />

      <h2 className="section-title">{t('settings.password.title')}</h2>
      <div className="card">
        <form onSubmit={changePassword}>
          <div className="field">
            <label htmlFor="current">{t('settings.password.current')}</label>
            <input
              id="current"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new">{t('settings.password.new')}</label>
            <input
              id="new"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          {status && (
            <p className={status.ok ? 'success-text' : 'error-text'}>{status.ok ? t('settings.password.changed') : errorMessage(status.error)}</p>
          )}
          <button className="btn btn-primary btn-block" disabled={saving}>
            {saving ? t('common.saving') : t('settings.password.submit')}
          </button>
        </form>
      </div>

      <ApiTokensSection />

      <button className="btn btn-block" style={{ marginTop: 24 }} onClick={logout}>
        {t('settings.logOut')}
      </button>
    </div>
  );
}
