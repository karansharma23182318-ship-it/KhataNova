import test from 'node:test';
import assert from 'node:assert/strict';
import { safeStopScannerControls } from './scannerControls';

test('safeStopScannerControls absorbs async rejections such as setPhotoOptions failed', async () => {
  let stopped = false;
  await assert.doesNotReject(async () => {
    await safeStopScannerControls({
      stop: async () => {
        stopped = true;
        throw new Error('setPhotoOptions failed');
      },
    });
  });
  assert.equal(stopped, true);
});

test('safeStopScannerControls handles synchronous throws and null safely', async () => {
  await assert.doesNotReject(async () => {
    await safeStopScannerControls(null);
    await safeStopScannerControls({
      stop: () => {
        throw new Error('sync stop error');
      },
    });
  });
});
