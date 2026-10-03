// UK-based milestones (with French consulate steps for dual-nationality children).
// Offsets are days from date of birth. Where no single legal deadline exists,
// the offset is a sensible target, not a hard rule — see each description.
// This is not legal or medical advice; verify current requirements for your situation.
//
// All displayed text lives in the i18n catalogs (milestones.*): the `key` of a milestone and the
// category keys are stored identifiers (completions in the database) — never rename or remove one.
// Texts are resolved at call time, never at module load.
import { t } from '../i18n/index.js';

const CATEGORY_DATA = {
  'baby-admin': { color: { light: '#2a78d6', dark: '#3987e5' } },
  'baby-medical': { color: { light: '#1baf7a', dark: '#199e70' } },
  nationality: { color: { light: '#eda100', dark: '#c98500' } },
  mom: { color: { light: '#e87ba4', dark: '#d55181' } },
  development: { color: { light: '#008300', dark: '#008300' } },
};

export function categoryLabel(categoryKey) {
  return t(`milestones.category.${categoryKey}`);
}

// `label` is a getter so existing callers (`cat.label`) keep working and follow the language.
export const MILESTONE_CATEGORIES = Object.fromEntries(
  Object.entries(CATEGORY_DATA).map(([key, data]) => [
    key,
    {
      ...data,
      labelKey: `milestones.category.${key}`,
      get label() {
        return categoryLabel(key);
      },
    },
  ]),
);

export function milestoneTitle(m) {
  return t(`milestones.item.${m.key}.title`);
}

export function milestoneDescription(m) {
  return t(`milestones.item.${m.key}.description`);
}

const BASE_MILESTONES = [
  { key: 'red-book', category: 'baby-admin', offsetDays: 0 },
  { key: 'blood-spot-test', category: 'baby-medical', offsetDays: 5 },
  { key: 'register-gp', category: 'baby-admin', offsetDays: 14 },
  { key: 'hearing-screening', category: 'baby-medical', offsetDays: 28 },
  { key: 'register-birth', category: 'baby-admin', offsetDays: 10 },
  { key: 'vaccines-8w', category: 'baby-medical', offsetDays: 56 },
  { key: '6-8-week-review', category: 'mom', offsetDays: 42 },
  { key: 'pelvic-floor-physio', category: 'mom', offsetDays: 28 },
  { key: 'healthy-start', category: 'baby-admin', offsetDays: 30 },
  { key: 'child-benefit', category: 'baby-admin', offsetDays: 90 },
  { key: 'vaccines-12w', category: 'baby-medical', offsetDays: 84 },
  { key: 'vaccines-16w', category: 'baby-medical', offsetDays: 112 },
  { key: 'french-birth-declaration', category: 'nationality', offsetDays: 8 },
  { key: 'consulate-transcription-fallback', category: 'nationality', offsetDays: 16 },
  { key: 'passport-uk', category: 'baby-admin', offsetDays: 90 },
  { key: 'vaccines-1y', category: 'baby-medical', offsetDays: 365 },
  { key: 'passport-french', category: 'nationality', offsetDays: 21 },
  { key: 'vaccines-18m', category: 'baby-medical', offsetDays: 548 },
  { key: 'vaccines-3y4m', category: 'baby-medical', offsetDays: 1217 },

  // Growth spurts: commonly cited pediatric guidance (not an NHS-specific schedule like the
  // vaccines above) — short, few-day bursts of increased hunger/fussiness/sleep disruption
  // around these ages. Completely normal to miss or not notice one; nothing to act on.
  { key: 'growth-spurt-3w', category: 'development', offsetDays: 17 },
  { key: 'growth-spurt-6w', category: 'development', offsetDays: 42 },
  { key: 'growth-spurt-3m', category: 'development', offsetDays: 90 },
  { key: 'growth-spurt-6m', category: 'development', offsetDays: 180 },
  { key: 'growth-spurt-9m', category: 'development', offsetDays: 270 },

  // Developmental milestones: NHS-sourced average ages with the normal range in the
  // description — huge individual variation is expected, "give or take a month or two"
  // per NHS guidance. These are not deadlines; check them off whenever it actually happens.
  { key: 'dev-social-smile', category: 'development', offsetDays: 42 },
  { key: 'dev-rolling', category: 'development', offsetDays: 152 },
  { key: 'dev-sitting', category: 'development', offsetDays: 213 },
  { key: 'dev-crawling', category: 'development', offsetDays: 335 },
  { key: 'dev-walking', category: 'development', offsetDays: 426 },
];

// `title` / `description` are getters so existing callers (`m.title`) keep working; they read the
// catalog when accessed (spreading `{ ...m }` while rendering captures the current language).
export const MILESTONES = BASE_MILESTONES.map((m) => ({
  ...m,
  get title() {
    return milestoneTitle(m);
  },
  get description() {
    return milestoneDescription(m);
  },
}));
