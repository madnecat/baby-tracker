// Import this FIRST from any node test that checks real message text (lib/ helpers return
// translated strings). It loads the catalogs from disk — Vite's import.meta.glob is not
// available under `node --test` — and selects a language.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerCatalogs, setLocaleValue } from './index.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

async function load(locale) {
  const folder = path.join(dir, locale);
  const merged = {};
  for (const file of fs.readdirSync(folder).filter((f) => f.endsWith('.js')).sort()) {
    Object.assign(merged, (await import(pathToFileURL(path.join(folder, file)).href)).default);
  }
  return merged;
}

registerCatalogs({ en: await load('en'), fr: await load('fr') });
setLocaleValue('en');

/** Run `fn` in another language (tests only), then restore English. */
export function withLocale(locale, fn) {
  setLocaleValue(locale);
  try {
    return fn();
  } finally {
    setLocaleValue('en');
  }
}
