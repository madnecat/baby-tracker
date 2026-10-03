import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Fails when a screen contains text that is written in the code instead of coming from the
// catalogs. It is a source scan (no parser, no new dependency): good enough to catch the usual
// ways text sneaks back in — text between JSX tags, and text in the attributes people read.

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Dev-only fixtures and the catalogs themselves are not UI.
const SKIP = [/[\\/]i18n[\\/]/, /\.test\.js$/, /sleepScenarios\.js$/, /sleepFixtures\.js$/];

// Text that is intentionally the same in every language. Keep this list SHORT and explain each.
const ALLOWED = new Set([
  'Baby Tracker', // the product name
  '👶 Baby Tracker', // the product name with its logo emoji (login heading)
  'Authorization', // HTTP header name shown inside a code sample for the API token page
  'Bearer', // HTTP auth scheme in that same code sample
  ', value:', // JSON punctuation in that same code sample
  'useAuth must be used within AuthProvider', // developer error (wrong component tree), never shown to users
]);

// A translation KEY (area.name.sub) passed along is not text.
const isKey = (text) => /^[a-z][\w-]*(\.[\w-]+)+$/.test(text);

function sourceFiles(folder, out = []) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.jsx$/.test(entry.name) && !SKIP.some((re) => re.test(full))) out.push(full);
  }
  return out;
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, lead) => lead + ' '.repeat(m.length - lead.length));
}

const hasWords = (text) => /[A-Za-zÀ-ÿ]{2,}/.test(text);

test('no user-visible text is written directly in the components and pages', () => {
  const found = [];
  for (const file of sourceFiles(root)) {
    const source = stripComments(fs.readFileSync(file, 'utf8'));
    const rel = path.relative(root, file);
    const lineOf = (index) => source.slice(0, index).split('\n').length;

    // 1. Text between JSX tags:  <p>Some text</p>
    for (const match of source.matchAll(/(?<![=\-])>([^<>{}]*?)</g)) {
      const text = match[1].replace(/\s+/g, ' ').trim();
      if (!text || !hasWords(text) || ALLOWED.has(text) || isKey(text)) continue;
      // `a > b && c < d` style comparisons inside code are not text.
      if (/[&|=;()]/.test(text)) continue;
      found.push(`${rel}:${lineOf(match.index)}  text  "${text}"`);
    }

    // 2. Attributes people read or hear.
    for (const match of source.matchAll(/\b(placeholder|aria-label|title|alt|label)\s*=\s*"([^"]*)"/g)) {
      const text = match[2].trim();
      if (!hasWords(text) || ALLOWED.has(text) || isKey(text)) continue;
      found.push(`${rel}:${lineOf(match.index)}  ${match[1]}  "${text}"`);
    }
    for (const match of source.matchAll(/\b(placeholder|aria-label|title|alt|label)\s*=\s*\{\s*(['"`])([^'"`]*)\2\s*\}/g)) {
      const text = match[3].trim();
      if (!hasWords(text) || ALLOWED.has(text) || isKey(text)) continue;
      found.push(`${rel}:${lineOf(match.index)}  ${match[1]}  "${text}"`);
    }

    // 3. Messages put straight into errors or state that is shown.
    for (const match of source.matchAll(/\b(?:new Error|setError|setStatus|showToast|setToast)\(\s*(['"`])([^'"`$]*)\1/g)) {
      const text = match[2].trim();
      if (!hasWords(text) || ALLOWED.has(text) || isKey(text)) continue;
      found.push(`${rel}:${lineOf(match.index)}  message  "${text}"`);
    }
  }
  assert.deepEqual(found, [], `hard-coded text found:\n${found.join('\n')}`);
});
