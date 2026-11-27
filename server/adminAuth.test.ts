import test from 'node:test';
import assert from 'node:assert/strict';
import { AdminAuthManager } from './adminAuth';

test('AdminAuthManager supports one-time claim, scrypt verification, and rejects second claim', () => {
  const manager = new AdminAuthManager({ storePath: null, envPasscode: '' });
  assert.equal(manager.getStatus().needsClaim, true);

  const claimed = manager.claimPasscode('MySecret#2026');
  assert.equal(claimed.ok, true);
  assert.equal(manager.getStatus().needsClaim, false);

  const secondClaim = manager.claimPasscode('AnotherPass123');
  assert.equal(secondClaim.ok, false);
  if (!secondClaim.ok) {
    assert.equal(secondClaim.status, 409);
  }

  const loginOk = manager.verifyLogin('MySecret#2026', '127.0.0.1');
  assert.equal(loginOk.ok, true);
  if (loginOk.ok) {
    const check = manager.verifyToken(loginOk.token);
    assert.equal(check.valid, true);

    manager.revokeToken(loginOk.token);
    assert.equal(manager.verifyToken(loginOk.token).valid, false);
  }

  const loginBad = manager.verifyLogin('wrong-pass', '127.0.0.1');
  assert.equal(loginBad.ok, false);
});

test('AdminAuthManager enforces rate limiting after 5 failed attempts and honors env override', () => {
  const manager = new AdminAuthManager({ storePath: null, envPasscode: 'EnvMasterPass99', maxAttempts: 5 });
  assert.equal(manager.getStatus().needsClaim, false);

  const t0 = 1_000_000;
  for (let i = 0; i < 4; i++) {
    const res = manager.verifyLogin('bad', '10.0.0.5', t0 + i * 1000);
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.status, 401);
  }

  const fifth = manager.verifyLogin('bad', '10.0.0.5', t0 + 5000);
  assert.equal(fifth.ok, false);
  if (!fifth.ok) {
    assert.equal(fifth.status, 429);
    assert.ok((fifth.retryAfterSeconds ?? 0) > 0);
  }

  // Different IP can still authenticate with env passcode
  const okOtherIp = manager.verifyLogin('EnvMasterPass99', '10.0.0.9', t0 + 6000);
  assert.equal(okOtherIp.ok, true);
});

test('AdminAuthManager.changePasscode validates current password, enforces length, updates credentials, and blocks env overrides', () => {
  const manager = new AdminAuthManager({ storePath: null, envPasscode: '' });
  const claimed = manager.claimPasscode('InitialPass#1');
  assert.equal(claimed.ok, true);

  // Wrong current password -> 401
  const wrongCurrent = manager.changePasscode('WrongPass', 'UpdatedPass#2');
  assert.equal(wrongCurrent.ok, false);
  if (!wrongCurrent.ok) assert.equal(wrongCurrent.status, 401);

  // Short new password -> 400
  const tooShort = manager.changePasscode('InitialPass#1', '12345');
  assert.equal(tooShort.ok, false);
  if (!tooShort.ok) assert.equal(tooShort.status, 400);

  // Valid change -> issues valid token and updates accepted login password
  const changed = manager.changePasscode('InitialPass#1', 'UpdatedPass#2');
  assert.equal(changed.ok, true);
  if (changed.ok) {
    assert.equal(manager.verifyToken(changed.token).valid, true);
  }
  assert.equal(manager.verifyLogin('InitialPass#1', '127.0.0.1').ok, false);
  assert.equal(manager.verifyLogin('UpdatedPass#2', '127.0.0.2').ok, true);

  // Env override blocks in-panel rotation -> 409
  const envManager = new AdminAuthManager({ storePath: null, envPasscode: 'EnvSecret99' });
  const envAttempt = envManager.changePasscode('EnvSecret99', 'NewSecret88');
  assert.equal(envAttempt.ok, false);
  if (!envAttempt.ok) assert.equal(envAttempt.status, 409);
});
