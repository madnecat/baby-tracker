import test from 'node:test';
import assert from 'node:assert/strict';
import { readNumberField } from './numberField.js';

test('accepts comma and point', () => {
  assert.deepEqual(readNumberField('2,5'), { value: 2.5, invalid: false });
  assert.deepEqual(readNumberField(' 37.1 '), { value: 37.1, invalid: false });
});

test('blank: null when optional, invalid when required', () => {
  assert.deepEqual(readNumberField(''), { value: null, invalid: false });
  assert.equal(readNumberField('  ', { required: true }).invalid, true);
});

test('rejects junk and out-of-range values', () => {
  assert.equal(readNumberField('abc').invalid, true);
  assert.equal(readNumberField('1,2,3').invalid, true);
  assert.equal(readNumberField('0', { required: true, min: 0, minExclusive: true }).invalid, true);
  assert.equal(readNumberField('0', { min: 0 }).invalid, false);
  assert.equal(readNumberField('-1', { min: 0 }).invalid, true);
  assert.equal(readNumberField('11', { max: 10 }).invalid, true);
});
