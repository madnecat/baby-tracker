import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { builtScriptOf } from './updateCheck.js';

describe('builtScriptOf', () => {
  it('finds the hashed entry script of a built index.html', () => {
    const html = '<script type="module" crossorigin src="/assets/index-Ab12_cD.js"></script>';
    assert.equal(builtScriptOf(html), '/assets/index-Ab12_cD.js');
  });

  it('is null for the dev page or anything else', () => {
    assert.equal(builtScriptOf('<script type="module" src="/src/main.jsx"></script>'), null);
  });
});
