import test from 'node:test';
import assert from 'node:assert/strict';
import { formatFirebaseAuthError } from './auth';

test('formatFirebaseAuthError explains unauthorized-domain with the current hostname', () => {
  const enErr = formatFirebaseAuthError(
    { code: 'auth/unauthorized-domain' },
    'en',
    'preview.run.app'
  );
  assert.equal(enErr.code, 'auth/unauthorized-domain');
  assert.equal(enErr.canRetryWithRedirect, false);
  assert.ok(enErr.message.includes('preview.run.app'));

  const hiErr = formatFirebaseAuthError(
    { code: 'auth/unauthorized-domain' },
    'hi',
    'preview.run.app'
  );
  assert.ok(hiErr.message.includes('preview.run.app'));
});

test('formatFirebaseAuthError marks popup-blocked and popup-closed as redirect-retryable', () => {
  const blocked = formatFirebaseAuthError({ code: 'auth/popup-blocked' }, 'en');
  assert.equal(blocked.canRetryWithRedirect, true);
  assert.ok(blocked.message.toLowerCase().includes('blocked'));

  const closed = formatFirebaseAuthError({ code: 'auth/popup-closed-by-user' }, 'hi');
  assert.equal(closed.canRetryWithRedirect, true);
});
