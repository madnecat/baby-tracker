import { api } from '../api/client.js';
import { LOCALES } from '../i18n/index.js';
import { useI18n } from '../i18n/I18nProvider.jsx';

/** Language picker. Each language is always shown in its own name, so it can be found from any language. */
export function LanguageSection() {
  const { t, locale, setLocale } = useI18n();

  function change(code) {
    // Saved to the account so it follows the person to every device. The switch itself must not
    // wait for (or depend on) the network: the screen changes language immediately.
    api.updateLanguage?.(code)?.catch(() => {});
    setLocale(code);
  }

  return (
    <>
      <h2 className="section-title">{t('language.title')}</h2>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="field" style={{ marginBottom: 8 }}>
          <label htmlFor="app-language">{t('language.label')}</label>
          <select id="app-language" value={locale} onChange={(e) => change(e.target.value)}>
            {LOCALES.map((code) => (
              <option key={code} value={code}>
                {t(`language.${code}`)}
              </option>
            ))}
          </select>
        </div>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('language.hint')}</p>
      </div>
    </>
  );
}
