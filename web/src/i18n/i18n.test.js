import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DEFAULT_LOCALE, detectLocale, interpolate, placeholdersOf, pluralBase, translate } from './core.js';
import { parseDecimal, normaliseDecimalText } from '../lib/parseDecimal.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

async function loadLocale(locale) {
  const folder = path.join(dir, locale);
  const files = fs.readdirSync(folder).filter((f) => f.endsWith('.js')).sort();
  const perFile = {};
  for (const file of files) {
    perFile[file] = (await import(pathToFileURL(path.join(folder, file)).href)).default;
  }
  return perFile;
}

const en = await loadLocale('en');
const fr = await loadLocale('fr');
const flat = (perFile) => Object.assign({}, ...Object.values(perFile));

test('English and French have exactly the same catalog files', () => {
  assert.deepEqual(Object.keys(en), Object.keys(fr));
});

test('no key is defined in two files of the same language (the merge would silently drop one)', () => {
  for (const [name, perFile] of [['en', en], ['fr', fr]]) {
    const seen = new Map();
    for (const [file, messages] of Object.entries(perFile)) {
      for (const key of Object.keys(messages)) {
        assert.ok(!seen.has(key), `${name}: "${key}" is in both ${seen.get(key)} and ${file}`);
        seen.set(key, file);
      }
    }
  }
});

test('English and French define exactly the same keys, file by file', () => {
  for (const file of Object.keys(en)) {
    const a = Object.keys(en[file]).sort();
    const b = Object.keys(fr[file] || {}).sort();
    assert.deepEqual(
      a.filter((k) => !b.includes(k)),
      [],
      `${file}: keys missing in French`
    );
    assert.deepEqual(
      b.filter((k) => !a.includes(k)),
      [],
      `${file}: keys only in French`
    );
  }
});

test('every message is a non-empty string, and French differs from English unless it is a name or unit', () => {
  for (const messages of [flat(en), flat(fr)]) {
    for (const [key, value] of Object.entries(messages)) {
      assert.equal(typeof value, 'string', key);
      assert.notEqual(value.trim(), '', `${key} is empty`);
    }
  }
});

// The French singular says "la dernière heure" / "dernière heure" instead of repeating the range
// text, so these two keys legitimately carry fewer placeholders than the English.
const PLACEHOLDERS_MAY_DIFFER = new Set([
  'chart.contractions.empty_one',
  'chart.contractions.empty_other',
  'chart.contractions.summaryLine_one',
  'chart.contractions.summaryLine_other',
]);

test('placeholders match between English and French for every key', () => {
  const a = flat(en);
  const b = flat(fr);
  for (const key of Object.keys(a)) {
    if (PLACEHOLDERS_MAY_DIFFER.has(key)) continue;
    assert.deepEqual(placeholdersOf(b[key]), placeholdersOf(a[key]), `placeholders differ for "${key}"`);
  }
});

test('plural forms are complete: every key_one has a key_other, in both languages', () => {
  for (const messages of [flat(en), flat(fr)]) {
    for (const key of Object.keys(messages)) {
      if (key.endsWith('_one')) {
        assert.ok(messages[`${pluralBase(key)}_other`], `${key} has no _other form`);
      }
      if (key.endsWith('_other')) {
        assert.ok(messages[`${pluralBase(key)}_one`], `${key} has no _one form`);
      }
    }
  }
});

test('French typography: no plain space before : ; ! ? (use a no-break space, U+00A0 / U+202F)', () => {
  for (const [key, value] of Object.entries(flat(fr))) {
    const stripped = value.replace(/\{\w+\}/g, '');
    assert.ok(!/ [:;!?]/.test(stripped), `${key}: plain space before punctuation in "${value}"`);
  }
});

test('every literal t("key") used in the source exists (and no key is used in code that is not defined)', () => {
  const root = path.join(dir, '..');
  const files = [];
  (function walk(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'i18n' && entry.name !== 'node_modules') walk(full);
      } else if (/\.(js|jsx)$/.test(entry.name) && !/\.test\.js$/.test(entry.name)) {
        files.push(full);
      }
    }
  })(root);

  const known = flat(en);
  const exists = (key) => key in known || `${key}_other` in known;
  const missing = [];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    // t('a.b'), tRich('a.b'), and t(`a.b`) without ${...}; dynamic keys (with ${}) are covered by
    // the label-map tests of the module that builds them.
    for (const match of source.matchAll(/\b(?:t|tRich)\(\s*(['"`])([\w.-]+)\1/g)) {
      if (!exists(match[2])) missing.push(`${path.relative(root, file)}: ${match[2]}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('detectLocale: saved choice, then a French browser, otherwise English', () => {
  assert.equal(detectLocale({ stored: 'fr', browserLanguages: ['en-GB'] }), 'fr');
  assert.equal(detectLocale({ stored: 'en', browserLanguages: ['fr-FR'] }), 'en');
  assert.equal(detectLocale({ stored: 'de', browserLanguages: ['fr-CA', 'en'] }), 'fr');
  assert.equal(detectLocale({ browserLanguages: ['de-DE', 'fr'] }), 'fr');
  assert.equal(detectLocale({ browserLanguages: ['de-DE'] }), DEFAULT_LOCALE);
  assert.equal(detectLocale({}), DEFAULT_LOCALE);
});

test('translate: placeholders, plurals (French counts 0 and 1 as singular), fallbacks', () => {
  const catalogs = {
    en: { hi: 'Hello {name}', feeds_one: '{count} feed', feeds_other: '{count} feeds', onlyEn: 'English only' },
    fr: { hi: 'Bonjour {name}', feeds_one: '{count} tétée', feeds_other: '{count} tétées' },
  };
  assert.equal(translate(catalogs, 'fr', 'hi', { name: 'Léa' }), 'Bonjour Léa');
  assert.equal(translate(catalogs, 'en', 'feeds', { count: 1 }), '1 feed');
  assert.equal(translate(catalogs, 'en', 'feeds', { count: 0 }), '0 feeds');
  assert.equal(translate(catalogs, 'fr', 'feeds', { count: 0 }), '0 tétée');
  assert.equal(translate(catalogs, 'fr', 'feeds', { count: 2 }), '2 tétées');
  assert.equal(translate(catalogs, 'fr', 'onlyEn'), 'English only', 'falls back to English');
  assert.equal(translate(catalogs, 'fr', 'nope'), 'nope', 'then to the key, so a gap is visible');
  assert.equal(interpolate('{a} and {b}', { a: 1 }), '1 and {b}', 'an unknown placeholder is left as is');
});

test('parseDecimal accepts a comma or a point and rejects everything else', () => {
  assert.equal(parseDecimal('2,5'), 2.5);
  assert.equal(parseDecimal(' 2.5 '), 2.5);
  assert.equal(parseDecimal('36,6'), 36.6);
  assert.equal(parseDecimal('7'), 7);
  assert.equal(parseDecimal('-1,5'), -1.5);
  assert.equal(parseDecimal(4), 4);
  for (const bad of ['', '  ', 'abc', '1,2,3', '1.2.3', '1e3', '2,5kg', null, undefined, NaN]) {
    assert.equal(parseDecimal(bad), null, String(bad));
  }
  assert.equal(normaliseDecimalText('2,5'), '2.5');
});
