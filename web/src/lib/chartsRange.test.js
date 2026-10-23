/** Tests for the remembered Charts time filter. Run with `npm test` from web/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RANGE_STORAGE_KEY, loadRangeDays, saveRangeDays } from './chartsRange.js';

const ALLOWED = [1, 2, 7, 30, 90];

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
  };
}

describe('remembered Charts range', () => {
  it('brings back what was saved', () => {
    const storage = memoryStorage();
    saveRangeDays(1, storage);
    assert.equal(loadRangeDays(ALLOWED, 7, storage), 1);
  });

  it('uses the fallback when nothing is saved', () => {
    assert.equal(loadRangeDays(ALLOWED, 7, memoryStorage()), 7);
  });

  it('ignores a saved value that is no longer a choice', () => {
    assert.equal(loadRangeDays(ALLOWED, 7, memoryStorage({ [RANGE_STORAGE_KEY]: '45' })), 7);
    assert.equal(loadRangeDays(ALLOWED, 7, memoryStorage({ [RANGE_STORAGE_KEY]: 'abc' })), 7);
  });

  it('survives storage that throws or is missing', () => {
    const broken = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
    };
    assert.equal(loadRangeDays(ALLOWED, 7, broken), 7);
    assert.doesNotThrow(() => saveRangeDays(30, broken));
    assert.equal(loadRangeDays(ALLOWED, 7, null), 7);
  });
});
