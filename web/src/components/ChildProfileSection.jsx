import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client.js';
import { t } from '../i18n/index.js';

export function ChildProfileSection() {
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [sex, setSex] = useState('female');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getChild()
      .then((c) => {
        if (c) {
          setName(c.name);
          setDob(c.dateOfBirth);
          setSex(c.sex);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      await api.putChild({ name, dateOfBirth: dob, sex });
      setStatus({ ok: true, message: t('profile.saved') });
    } catch (err) {
      setStatus({ ok: false, message: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <>
      <h2 className="section-title">{t('profile.title')}</h2>
      <div className="card" style={{ marginBottom: 20 }}>
        <p style={{ marginTop: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {t('profile.hint')}
        </p>
        <form onSubmit={save}>
          <div className="field">
            <label htmlFor="babyname">{t('profile.name')}</label>
            <input id="babyname" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="babydob">{t('profile.dob')}</label>
            <input
              id="babydob"
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              required
            />
          </div>
          <div className="choice-row">
            <button
              type="button"
              className={`choice-btn${sex === 'female' ? ' selected' : ''}`}
              onClick={() => setSex('female')}
            >
              {t('profile.sex.female')}
            </button>
            <button
              type="button"
              className={`choice-btn${sex === 'male' ? ' selected' : ''}`}
              onClick={() => setSex('male')}
            >
              {t('profile.sex.male')}
            </button>
          </div>
          {status && <p className={status.ok ? 'success-text' : 'error-text'}>{status.message}</p>}
          <button className="btn btn-primary btn-block" disabled={saving}>
            {saving ? t('common.saving') : t('profile.save')}
          </button>
        </form>
      </div>
    </>
  );
}
