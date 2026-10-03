import '../i18n/testSetup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { withLocale } from '../i18n/testSetup.js';
import { ApiError, api, errorMessage } from './client.js';

test('errorMessage translates a known code and falls back to the English text', () => {
  const known = new ApiError('Invalid username or password', { status: 401, code: 'AUTH_INVALID_CREDENTIALS' });
  assert.equal(errorMessage(known), 'Invalid username or password.');
  assert.match(withLocale('fr', () => errorMessage(known)), /incorrect/);

  const unknown = new ApiError('Some new server text', { status: 400, code: 'SOMETHING_NEW' });
  assert.equal(errorMessage(unknown), 'Some new server text');
  assert.equal(errorMessage(new Error('plain')), 'plain');
  assert.equal(errorMessage(new Error('')), 'Something went wrong. Please try again.');
  assert.equal(errorMessage(undefined), 'Something went wrong. Please try again.');
});

test('request fills status/code from the server and reports network failures', async () => {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Mum is already set up for this household.', code: 'MOM_ALREADY_SET' }),
    });
    await assert.rejects(api.requestMomSetup(), (e) => {
      assert.equal(e.status, 409);
      assert.equal(e.code, 'MOM_ALREADY_SET');
      assert.equal(e.message, 'Mum is already set up for this household.');
      return true;
    });

    globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => { throw new Error('html'); } });
    await assert.rejects(api.session(), (e) => {
      assert.equal(e.status, 500);
      assert.equal(e.message, 'Request failed (500)');
      assert.equal(errorMessage(e), 'The request failed (500).');
      return true;
    });

    globalThis.fetch = async () => {
      throw new TypeError('fetch failed');
    };
    await assert.rejects(api.session(), (e) => {
      assert.equal(e.status, 0);
      assert.equal(e.code, 'network');
      assert.match(errorMessage(e), /reach the server/);
      return true;
    });
  } finally {
    globalThis.fetch = realFetch;
  }
});
