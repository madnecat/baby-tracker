import test from 'node:test';
import assert from 'node:assert/strict';
import '../i18n/testSetup.js';
import { withLocale } from '../i18n/testSetup.js';
import {
  MILESTONES,
  MILESTONE_CATEGORIES,
  categoryLabel,
  milestoneTitle,
  milestoneDescription,
} from './milestones.js';
import { placeholdersOf } from '../i18n/core.js';
import { hasMessage } from '../i18n/index.js';

// Keys are stored in the database as completions: this list must never lose or rename an entry.
const EXPECTED_KEYS = [
  'red-book', 'blood-spot-test', 'register-gp', 'hearing-screening', 'register-birth',
  'vaccines-8w', '6-8-week-review', 'pelvic-floor-physio', 'healthy-start', 'child-benefit',
  'vaccines-12w', 'vaccines-16w', 'french-birth-declaration', 'consulate-transcription-fallback',
  'passport-uk', 'vaccines-1y', 'passport-french', 'vaccines-18m', 'vaccines-3y4m',
  'growth-spurt-3w', 'growth-spurt-6w', 'growth-spurt-3m', 'growth-spurt-6m', 'growth-spurt-9m',
  'dev-social-smile', 'dev-rolling', 'dev-sitting', 'dev-crawling', 'dev-walking',
];

test('milestone keys and order are unchanged', () => {
  assert.deepEqual(MILESTONES.map((m) => m.key), EXPECTED_KEYS);
  assert.equal(new Set(EXPECTED_KEYS).size, EXPECTED_KEYS.length);
});

test('category keys are unchanged and every milestone uses a known one', () => {
  assert.deepEqual(Object.keys(MILESTONE_CATEGORIES), [
    'baby-admin', 'baby-medical', 'nationality', 'mom', 'development',
  ]);
  for (const m of MILESTONES) assert.ok(MILESTONE_CATEGORIES[m.category], m.key);
});

test('every milestone has a title and description in en and fr', () => {
  for (const locale of ['en', 'fr']) {
    withLocale(locale, () => {
      for (const m of MILESTONES) {
        for (const part of ['title', 'description']) {
          assert.ok(hasMessage(`milestones.item.${m.key}.${part}`), `${locale} ${m.key} ${part}`);
        }
        assert.ok(milestoneTitle(m).trim().length > 0);
        assert.ok(milestoneDescription(m).trim().length > 0);
        assert.equal(m.title, milestoneTitle(m));
        assert.equal(m.description, milestoneDescription(m));
      }
    });
  }
});

test('category labels exist in en and fr', () => {
  for (const locale of ['en', 'fr']) {
    withLocale(locale, () => {
      for (const key of Object.keys(MILESTONE_CATEGORIES)) {
        assert.ok(hasMessage(`milestones.category.${key}`), `${locale} ${key}`);
        assert.equal(categoryLabel(key), MILESTONE_CATEGORIES[key].label);
        assert.ok(!categoryLabel(key).startsWith('milestones.'));
      }
    });
  }
  assert.equal(categoryLabel('mom'), 'Mum');
  assert.equal(withLocale('fr', () => categoryLabel('mom')), 'Maman');
});

test('placeholders match between en and fr', () => {
  for (const m of MILESTONES) {
    for (const part of ['title', 'description']) {
      const en = milestoneText('en', m, part);
      const fr = milestoneText('fr', m, part);
      assert.deepEqual(placeholdersOf(en), placeholdersOf(fr), `${m.key} ${part}`);
    }
  }
});

function milestoneText(locale, m, part) {
  return withLocale(locale, () => (part === 'title' ? milestoneTitle(m) : milestoneDescription(m)));
}

test('texts do not depend on milestone order', () => {
  for (const locale of ['en', 'fr']) {
    for (const m of MILESTONES) {
      const text = milestoneText(locale, m, 'description');
      assert.ok(!/\b(see below|see above|same pattern as above|voir ci-dessous|ci-dessus)\b/i.test(text), `${locale} ${m.key}`);
    }
  }
});
