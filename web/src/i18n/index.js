// The i18n runtime. Safe to import from anywhere, including plain lib/ code and node tests: it
// touches no browser globals at import time and does not import the catalogs itself (the provider
// registers them in the app; tests/testSetup.js registers them from disk).
import { enGB } from 'date-fns/locale/en-GB';
import { fr as frLocale } from 'date-fns/locale/fr';
import { DEFAULT_LOCALE, INTL_LOCALE, LOCALES, detectLocale, isSupportedLocale, translate } from './core.js';

export { LOCALES, DEFAULT_LOCALE, isSupportedLocale };

const STORAGE_KEY = 'bt_language';
const DATE_FNS_LOCALES = { en: enGB, fr: frLocale };

let catalogs = { en: {}, fr: {} };
// One module-level slot so plain helpers (date/duration formatting in lib/) can use the language
// without threading it through every call. The provider re-mounts the app when it changes, so
// nothing keeps showing the old language.
let currentLocale = DEFAULT_LOCALE;

export function registerCatalogs(next) {
  catalogs = next;
}

export function getLocale() {
  return currentLocale;
}

export function setLocaleValue(locale) {
  currentLocale = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
}

/**
 * Translate a message in the current language. Call it while rendering or inside a function that
 * runs later — NEVER at module load time (it would freeze in the language of the first load).
 */
export function t(key, params) {
  return translate(catalogs, currentLocale, key, params);
}

/**
 * Label for a STORED value (a side, a tag, a consistency…): `t(`${prefix}.${value}`)` when that
 * message exists, otherwise the raw value — so an unexpected value from the API or the MCP still
 * shows something sensible instead of a raw key. Never use it to translate user-typed text.
 */
export function tOr(prefix, value, params) {
  const key = `${prefix}.${value}`;
  return hasMessage(key) ? t(key, params) : String(value ?? '');
}

/** True if `key` exists (as is, or as a plural form) in the current language's catalog. */
export function hasMessage(key) {
  const c = catalogs[currentLocale] || {};
  return key in c || `${key}_other` in c;
}

/** date-fns locale for the current language (British English or French). */
export function dateFnsLocale() {
  return DATE_FNS_LOCALES[currentLocale];
}

/** BCP-47 tag for Intl (en-GB / fr-FR) for the current language. */
export function intlLocale() {
  return INTL_LOCALE[currentLocale];
}

export function formatNumber(value, options) {
  return new Intl.NumberFormat(intlLocale(), options).format(value);
}

/** The saved choice (if any) → the browser's language → English. Storage may be unavailable. */
export function loadInitialLocale() {
  let stored = null;
  try {
    stored = globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    // Private mode / blocked storage: fall back to detection only.
  }
  const nav = globalThis.navigator;
  const browserLanguages = nav ? (nav.languages?.length ? [...nav.languages] : [nav.language]) : [];
  return detectLocale({ stored, browserLanguages });
}

export function saveLocale(locale) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, locale);
  } catch {
    // The choice then only lasts for this visit.
  }
}
