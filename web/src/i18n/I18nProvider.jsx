import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { catalogs } from './catalogs.js';
import { loadInitialLocale, registerCatalogs, saveLocale, setLocaleValue, t } from './index.js';

const I18nContext = createContext(null);

// Set before the first render so even the very first paint (and anything outside React) is in
// the right language.
registerCatalogs(catalogs);
const initialLocale = loadInitialLocale();
setLocaleValue(initialLocale);
if (typeof document !== 'undefined') document.documentElement.lang = initialLocale;

/**
 * Holds the chosen language. Changing it re-mounts the subtree (key={locale}): every component
 * and every memoised value is rebuilt in the new language, so no translated text can be left
 * behind in state. It sits above AuthProvider because the login page needs it before any user.
 */
export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(initialLocale);

  const setLocale = useCallback((next) => {
    setLocaleValue(next);
    saveLocale(next);
    document.documentElement.lang = next;
    setLocaleState(next);
  }, []);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale]);

  return (
    <I18nContext.Provider value={value}>
      <div key={locale} style={{ display: 'contents' }}>
        {children}
      </div>
    </I18nContext.Provider>
  );
}

/** `{ t, locale, setLocale }` — `t` always translates in the current language. */
export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
