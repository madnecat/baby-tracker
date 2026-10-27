import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../api/client.js';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { isSupportedLocale } from '../i18n/index.js';
import { applyTheme } from './theme.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { t, locale, setLocale } = useI18n();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unreachable, setUnreachable] = useState(false); // session check failed for a reason other than 401
  const savedLanguageFor = useRef(null);

  const checkSession = useCallback(() => {
    setLoading(true);
    setUnreachable(false);
    api
      .session()
      .then(setUser)
      .catch((err) => {
        // Only a 401 means "not logged in". A network or server failure must not log anyone out.
        if (err?.status === 401) setUser(null);
        else setUnreachable(true);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // The language lives on the account. A saved one wins over this device's guess (the switch
  // re-mounts the tree once, then the session returns the same language and it settles); an
  // account that never chose one adopts the language this device is showing.
  useEffect(() => {
    if (!user) return;
    if (isSupportedLocale(user.language)) {
      if (user.language !== locale) setLocale(user.language);
    } else if (savedLanguageFor.current !== user.id) {
      savedLanguageFor.current = user.id;
      api
        .updateLanguage(locale)
        .then(() => setUser((u) => (u ? { ...u, language: locale } : u)))
        .catch(() => {});
    }
  }, [user, locale, setLocale]);

  // The theme lives on the account too: every device shows the one chosen on any of them.
  useEffect(() => {
    if (user) applyTheme(user.theme ?? null);
  }, [user?.id, user?.theme]); // eslint-disable-line react-hooks/exhaustive-deps

  // Coming back to the app (a tab left open, a phone unlocked) picks up a theme changed elsewhere.
  useEffect(() => {
    if (!user) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      api
        .session()
        .then((fresh) => setUser((u) => (u && u.theme !== (fresh.theme ?? null) ? { ...u, theme: fresh.theme ?? null } : u)))
        .catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Chooses the theme ('light' | 'dark' | null for the device's own): shown at once, saved to the account. */
  const setTheme = useCallback((theme) => {
    applyTheme(theme);
    setUser((u) => (u ? { ...u, theme } : u));
    api.updateTheme(theme).catch(() => {});
  }, []);

  const login = useCallback(async (username, password) => {
    const loggedIn = await api.login(username, password);
    setUser(loggedIn);
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setUser(null);
  }, []);

  if (unreachable) {
    return (
      <div className="centered-message">
        <p>{t('errors.network')}</p>
        <button type="button" className="btn" onClick={checkSession}>
          {t('login.retry')}
        </button>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setTheme }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
