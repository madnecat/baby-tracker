import { useState } from 'react';
import { useAuth } from '../lib/AuthContext.jsx';
import { api } from '../api/client.js';
import { ApiTokensSection } from '../components/ApiTokensSection.jsx';
import { ChildProfileSection } from '../components/ChildProfileSection.jsx';

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
      setStatus({ ok: true, message: 'Password changed.' });
    } catch (err) {
      setStatus({ ok: false, message: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">Settings</h1>

      <div className="card" style={{ marginBottom: 20 }}>
        Signed in as <strong>{user?.displayName}</strong>
      </div>

      <ChildProfileSection />

      <h2 className="section-title">Change password</h2>
      <div className="card">
        <form onSubmit={changePassword}>
          <div className="field">
            <label htmlFor="current">Current password</label>
            <input
              id="current"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new">New password</label>
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
            <p className={status.ok ? 'success-text' : 'error-text'}>{status.message}</p>
          )}
          <button className="btn btn-primary btn-block" disabled={saving}>
            {saving ? 'Saving…' : 'Change password'}
          </button>
        </form>
      </div>

      <ApiTokensSection />

      <button className="btn btn-block" style={{ marginTop: 24 }} onClick={logout}>
        Log out
      </button>
    </div>
  );
}
