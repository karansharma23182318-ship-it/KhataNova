import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateKnownProfit,
  calculateLineTotal,
  calculateSaleTotals,
  computeLedgerRunningBalances,
  computePast7DaysSalesTrend,
  formatINR,
  formatSaleItemQuantity,
  getLocalDateKey,
  getLocalMonthKey,
  parseQuantityInput,
  toLocalIsoTimestamp,
  validateCustomerPaymentAmount,
  validateSalePaymentAllocation,
} from './finance';

test('formatINR formats Indian Rupee values with proper grouping', () => {
  assert.equal(formatINR(125000), '₹1,25,000');
  assert.equal(formatINR(199.5), '₹199.50');
  assert.equal(formatINR(-450), '-₹450');
});

test('calculateLineTotal and calculateSaleTotals compute accurate totals with clamped discount', () => {
  assert.equal(calculateLineTotal(2.5, 40), 100);
  const totals = calculateSaleTotals(
    [
      { quantity: 2, unitPrice: 120 },
      { quantity: 1, unitPrice: 60 },
    ],
    50
  );
  assert.deepEqual(totals, { subtotal: 300, discount: 50, finalTotal: 250 });

  const clamped = calculateSaleTotals([{ quantity: 1, unitPrice: 100 }], 200);
  assert.deepEqual(clamped, { subtotal: 100, discount: 100, finalTotal: 0 });
});

test('validateSalePaymentAllocation validates cash, udhaar, and split payments', () => {
  assert.deepEqual(validateSalePaymentAllocation(500, 'cash'), {
    valid: true,
    paidAmount: 500,
    dueAmount: 0,
  });
  assert.deepEqual(validateSalePaymentAllocation(500, 'udhaar'), {
    valid: true,
    paidAmount: 0,
    dueAmount: 500,
  });
  assert.deepEqual(
    validateSalePaymentAllocation(500, 'split', { cash: 200, upi: 150, udhaar: 150 }),
    {
      valid: true,
      paidAmount: 350,
      dueAmount: 150,
    }
  );
  const badSplit = validateSalePaymentAllocation(500, 'split', { cash: 200, upi: 100, udhaar: 100 });
  assert.equal(badSplit.valid, false);
});

test('validateCustomerPaymentAmount prevents accidental overpayment unless advance is enabled', () => {
  assert.equal(validateCustomerPaymentAmount(300, 500, false).valid, true);
  assert.equal(validateCustomerPaymentAmount(600, 500, false).valid, false);
  assert.equal(validateCustomerPaymentAmount(600, 500, true).valid, true);
});

test('computeLedgerRunningBalances calculates running balances chronologically', () => {
  const ledger = computeLedgerRunningBalances(100, [
    {
      id: '2',
      shopId: 's1',
      customerId: 'c1',
      transactionDate: '2026-11-22T12:00:00Z',
      description: 'Payment received',
      type: 'credit',
      debit: 0,
      credit: 150,
      amount: 150,
      referenceId: 'RCP-1',
      createdByUid: 'u1',
      createdAt: '2026-11-22T12:00:00Z',
    },
    {
      id: '1',
      shopId: 's1',
      customerId: 'c1',
      transactionDate: '2026-11-22T10:00:00Z',
      description: 'Credit sale',
      type: 'debit',
      debit: 250,
      credit: 0,
      amount: 250,
      referenceId: 'INV-1',
      createdByUid: 'u1',
      createdAt: '2026-11-22T10:00:00Z',
    },
  ]);

  assert.equal(ledger[0].id, '1');
  assert.equal(ledger[0].runningBalance, 350);
  assert.equal(ledger[1].id, '2');
  assert.equal(ledger[1].runningBalance, 200);
});

test('calculateKnownProfit returns null when no purchase cost exists and computes profit otherwise', () => {
  assert.equal(
    calculateKnownProfit([
      { id: 'i1', name: 'Rice', quantity: 2, unit: 'kg', unitPrice: 60, lineTotal: 120 },
    ]),
    null
  );
  assert.equal(
    calculateKnownProfit([
      {
        id: 'i1',
        name: 'Rice',
        quantity: 2,
        unit: 'kg',
        unitPrice: 60,
        purchaseCost: 45,
        lineTotal: 120,
      },
    ]),
    30
  );
});

test('computePast7DaysSalesTrend builds 7 local daily buckets excluding cancelled and out-of-window sales', () => {
  const ref = new Date(2026, 10, 23, 12, 0, 0);
  const localIso = (day: number, hour: number) => new Date(2026, 10, day, hour, 0, 0).toISOString();

  const trend = computePast7DaysSalesTrend(
    [
      { createdAt: localIso(16, 10), finalTotal: 999, status: 'completed' }, // 8 days ago -> excluded
      { createdAt: localIso(17, 1), finalTotal: 250, status: 'completed' }, // day 0 (early morning local)
      { createdAt: localIso(20, 9), finalTotal: 400, status: 'completed' },
      { createdAt: localIso(20, 23), finalTotal: 150.5, status: 'completed' }, // late night local
      { createdAt: localIso(20, 19), finalTotal: 500, status: 'cancelled' }, // cancelled -> excluded
      { createdAt: localIso(23, 0), finalTotal: 800, status: 'completed' }, // midnight local today
    ],
    ref
  );

  assert.equal(trend.length, 7);
  assert.equal(trend[0].dateKey, '2026-11-17');
  assert.equal(trend[0].label, '17 Nov');
  assert.equal(trend[0].totalSales, 250);
  assert.equal(trend[0].saleCount, 1);

  assert.equal(trend[3].dateKey, '2026-11-20');
  assert.equal(trend[3].totalSales, 550.5);
  assert.equal(trend[3].saleCount, 2);

  assert.equal(trend[6].dateKey, '2026-11-23');
  assert.equal(trend[6].totalSales, 800);
});

test('getLocalDateKey, getLocalMonthKey, and toLocalIsoTimestamp avoid UTC midnight date shifts', () => {
  const localMidnight = new Date(2026, 10, 25, 0, 30, 0);
  assert.equal(getLocalDateKey(localMidnight), '2026-11-25');
  assert.equal(getLocalMonthKey(localMidnight), '2026-11');
  assert.equal(getLocalDateKey('2026-11-25'), '2026-11-25');

  const pastIso = toLocalIsoTimestamp('2026-11-20');
  assert.equal(getLocalDateKey(pastIso), '2026-11-20');
});

test('parseQuantityInput supports plain numbers, fractions, mixed words+numbers, and pure words', () => {
  assert.deepEqual(parseQuantityInput(''), { numericQty: 0, hasValue: false });
  assert.deepEqual(parseQuantityInput('0'), { numericQty: 0, hasValue: false });
  assert.deepEqual(parseQuantityInput('2.5'), { numericQty: 2.5, hasValue: true });

  assert.deepEqual(parseQuantityInput('1/2'), {
    numericQty: 0.5,
    quantityLabel: '1/2',
    hasValue: true,
  });
  assert.deepEqual(parseQuantityInput('2 box extra'), {
    numericQty: 2,
    quantityLabel: '2 box extra',
    hasValue: true,
  });
  assert.deepEqual(parseQuantityInput('आधा किलो'), {
    numericQty: 1,
    quantityLabel: 'आधा किलो',
    hasValue: true,
  });
});

test('formatSaleItemQuantity renders quantity labels cleanly with units and ASCII-safe PDF fallback', () => {
  assert.equal(formatSaleItemQuantity({ quantity: 2, unit: 'kg' }), '2 kg');
  assert.equal(
    formatSaleItemQuantity({ quantity: 2, quantityLabel: '2 box', unit: 'pcs' }),
    '2 box pcs'
  );
  assert.equal(
    formatSaleItemQuantity({ quantity: 2, quantityLabel: '2 kg', unit: 'kg' }),
    '2 kg'
  );
  assert.equal(
    formatSaleItemQuantity({ quantity: 1, quantityLabel: 'आधा किलो', unit: 'kg' }),
    'आधा किलो kg'
  );
  assert.equal(
    formatSaleItemQuantity({ quantity: 1, quantityLabel: 'आधा किलो', unit: 'gm' }, { asciiOnly: true }),
    '1 gm'
  );
});
