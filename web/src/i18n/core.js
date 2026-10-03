// Pure i18n helpers — no browser globals, so they can be unit-tested with node --test.

export const LOCALES = ['en', 'fr'];
export const DEFAULT_LOCALE = 'en';

/** Locale used for Intl formatting: English means British formats, French means French formats. */
export const INTL_LOCALE = { en: 'en-GB', fr: 'fr-FR' };

export function isSupportedLocale(value) {
  return LOCALES.includes(value);
}

/**
 * The language to start in: the one the user chose before (if it is still supported), else the
 * browser's language when it is French, else English. `stored` and `browserLanguages` are passed
 * in so nothing here touches localStorage / navigator.
 */
export function detectLocale({ stored, browserLanguages = [] } = {}) {
  if (isSupportedLocale(stored)) return stored;
  for (const language of browserLanguages) {
    const primary = String(language || '').toLowerCase().split('-')[0];
    if (isSupportedLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}

export const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;

/** Names of the {placeholders} in a message, sorted and de-duplicated (used by the parity test). */
export function placeholdersOf(message) {
  return [...new Set([...String(message).matchAll(PLACEHOLDER_PATTERN)].map((m) => m[1]))].sort();
}

export function interpolate(message, params) {
  if (!params) return message;
  return message.replace(PLACEHOLDER_PATTERN, (whole, name) =>
    params[name] === undefined || params[name] === null ? whole : String(params[name])
  );
}

const PLURAL_SUFFIXES = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

/** Base key of a plural form ('feeds_one' -> 'feeds'), or null when the key is not a plural form. */
export function pluralBase(key) {
  const i = key.lastIndexOf('_');
  if (i <= 0) return null;
  return PLURAL_SUFFIXES.has(key.slice(i + 1)) ? key.slice(0, i) : null;
}

/**
 * Looks `key` up for `locale`, falling back to English and finally to the key itself (so a
 * missing message is visible instead of blank). With `params.count`, the plural form for the
 * locale is preferred: `key_one` / `key_other` / … chosen with Intl.PluralRules (French treats
 * 0 and 1 as "one"), falling back to `key_other`, then to plain `key`.
 */
export function translate(catalogs, locale, key, params) {
  const chain = locale === DEFAULT_LOCALE ? [locale] : [locale, DEFAULT_LOCALE];
  for (const language of chain) {
    const catalog = catalogs[language];
    if (!catalog) continue;
    let message;
    if (params && typeof params.count === 'number') {
      const category = new Intl.PluralRules(INTL_LOCALE[language] || language).select(params.count);
      message = catalog[`${key}_${category}`] ?? catalog[`${key}_other`];
    }
    message = message ?? catalog[key];
    if (typeof message === 'string') return interpolate(message, params);
  }
  return key;
}
