import { t } from '../i18n/index.js';

// `key` is the stored value. `labelKey` is the catalog key; `label` is a lazy getter (resolved when
// read, never at import) kept so callers not yet migrated to t(labelKey) keep working.
const option = (key) => ({
  key,
  labelKey: `diaper.consistency.${key}`,
  get label() {
    return t(this.labelKey);
  },
});

export const CONSISTENCY_OPTIONS = ['watery', 'soft', 'normal', 'hard'].map(option);
