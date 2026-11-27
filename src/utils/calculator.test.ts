import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateChangeReturn,
  calculateRateByUnit,
  calculateWeightFromBudget,
} from './calculator';

test('calculateRateByUnit computes kg + gram prices accurately', () => {
  const res = calculateRateByUnit({
    unit: 'kg',
    baseRate: 60,
    primaryQty: 1,
    subQty: 250,
  });
  assert.equal(res.normalizedQty, 1.25);
  assert.equal(res.totalPrice, 75);
  assert.equal(res.qtyDisplayHi, '1 kg 250 gm');
});

test('calculateRateByUnit computes gram-only and dozen prices accurately', () => {
  const gmOnly = calculateRateByUnit({
    unit: 'kg',
    baseRate: 80,
    primaryQty: 0,
    subQty: 250,
  });
  assert.equal(gmOnly.totalPrice, 20);
  assert.equal(gmOnly.qtyDisplayHi, '250 gm');

  const doz = calculateRateByUnit({
    unit: 'dozen',
    baseRate: 120,
    primaryQty: 1,
    subQty: 6,
  });
  assert.equal(doz.normalizedQty, 1.5);
  assert.equal(doz.totalPrice, 180);
});

test('calculateWeightFromBudget converts rupees budget to exact kg/gm or pcs', () => {
  const sugar = calculateWeightFromBudget({
    unit: 'kg',
    baseRate: 44,
    budgetAmount: 50,
  });
  assert.equal(sugar.primaryQty, 1);
  assert.equal(sugar.subQty, 136);
  assert.equal(sugar.displayHi, '1 kg 136 gm');

  const bananas = calculateWeightFromBudget({
    unit: 'dozen',
    baseRate: 60,
    budgetAmount: 25,
  });
  assert.equal(bananas.primaryQty, 0);
  assert.equal(bananas.subQty, 5);
  assert.equal(bananas.displayEn, '5 pcs');
});

test('calculateChangeReturn computes exact change due and short amounts', () => {
  assert.deepEqual(calculateChangeReturn(168, 200), { changeDue: 32, shortBy: 0 });
  assert.deepEqual(calculateChangeReturn(168, 100), { changeDue: 0, shortBy: 68 });
});
