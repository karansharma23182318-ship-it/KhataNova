import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScanBeepSchedule, playScanBeepSound } from './scannerSound';

test('buildScanBeepSchedule defaults to authentic dual-tone ascending hardware POS scanner chirp', () => {
  const schedule = buildScanBeepSchedule();
  assert.equal(schedule.length, 2);
  assert.equal(schedule[0].startOffsetSec, 0);
  assert.equal(schedule[0].waveform, 'triangle');
  assert.ok(schedule[1].frequencyHz > schedule[0].frequencyHz);
  assert.equal(schedule[1].startOffsetSec, schedule[0].durationSec);
});

test('buildScanBeepSchedule supports custom pulse cadence overrides', () => {
  const schedule = buildScanBeepSchedule({
    pulses: 3,
    frequencyHz: 2600,
    pulseDurationSec: 0.04,
    gapSec: 0.01,
  });
  assert.equal(schedule.length, 3);
  assert.equal(schedule[0].startOffsetSec, 0);
  assert.equal(schedule[1].startOffsetSec, 0.05);
  assert.equal(schedule[2].startOffsetSec, 0.1);
  assert.equal(schedule[0].frequencyHz, 2600);
});

test('playScanBeepSound fails safely without throwing in non-browser Node runtime', () => {
  assert.equal(playScanBeepSound(), false);
});
