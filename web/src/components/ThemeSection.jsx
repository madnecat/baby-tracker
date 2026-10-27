import { useAuth } from '../lib/AuthContext.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';

const CHOICES = [
  { value: null, key: 'auto' },
  { value: 'light', key: 'light' },
  { value: 'dark', key: 'dark' },
];

/** Colour theme picker. Saved to the account, so it follows the person to every device. */
export function ThemeSection() {
  const { t } = useI18n();
  const { user, setTheme } = useAuth();
  const current = user?.theme ?? null;

  return (
    <>
      <h2 className="section-title">{t('theme.title')}</h2>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="choice-row" role="radiogroup" aria-label={t('theme.title')} style={{ marginBottom: 8 }}>
          {CHOICES.map((c) => (
            <button
              key={c.key}
              type="button"
              role="radio"
              aria-checked={current === c.value}
              className={`choice-btn${current === c.value ? ' selected' : ''}`}
              onClick={() => setTheme(c.value)}
            >
              {t(`theme.${c.key}`)}
            </button>
          ))}
        </div>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('theme.hint')}</p>
      </div>
    </>
  );
}
