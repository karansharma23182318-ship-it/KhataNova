import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampReminderIntervalDays,
  createDefaultReminderSettings,
  evaluateCustomerDueStatus,
  findOldestUnsettledUdhaarDate,
  reconcileDueNotifications,
  DAY_MS,
} from './dueReminders';
import type { Customer, Sale } from '../types/models';

const baseNowMs = Date.parse('2026-11-23T10:00:00.000Z');
const daysAgoIso = (days: number) => new Date(baseNowMs - days * DAY_MS).toISOString();

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'cust-1',
    shopId: 'shop-1',
    name: 'Ramesh Kumar',
    mobileNumber: '9876543210',
    openingBalance: 0,
    outstandingBalance: 500,
    totalCredit: 500,
    totalPaid: 0,
    isActive: true,
    createdAt: daysAgoIso(10),
    updatedAt: daysAgoIso(10),
    ...overrides,
  };
}

function makeCreditSale(id: string, customerId: string, dueAmount: number, daysAgo: number): Sale {
  return {
    id,
    invoiceId: `INV-${id}`,
    shopId: 'shop-1',
    customerId,
    customerName: 'Ramesh Kumar',
    items: [{ id: 'i1', name: 'Rice', quantity: 1, unit: 'kg', unitPrice: dueAmount, lineTotal: dueAmount }],
    subtotal: dueAmount,
    discount: 0,
    finalTotal: dueAmount,
    paymentMethod: 'udhaar',
    paidAmount: 0,
    dueAmount,
    status: 'completed',
    createdByUid: 'shop-1',
    createdAt: daysAgoIso(daysAgo),
    updatedAt: daysAgoIso(daysAgo),
  };
}

test('default reminder interval is 7 days and clamps invalid intervals safely', () => {
  const defaults = createDefaultReminderSettings();
  assert.equal(defaults.enabled, true);
  assert.equal(defaults.intervalDays, 7);
  assert.equal(clampReminderIntervalDays(0), 7);
  assert.equal(clampReminderIntervalDays(-5), 7);
  assert.equal(clampReminderIntervalDays('abc'), 7);
  assert.equal(clampReminderIntervalDays(14), 14);
  assert.equal(clampReminderIntervalDays(500), 365);
});

test('FIFO unsettled Udhaar anchor skips already-paid older bills and tracks remaining unpaid bill', () => {
  const customer = makeCustomer({
    openingBalance: 0,
    outstandingBalance: 300,
    totalCredit: 800,
    totalPaid: 500,
    createdAt: daysAgoIso(20),
  });
  const sales: Sale[] = [
    makeCreditSale('s1', 'cust-1', 500, 15), // settled by the 500 paid
    makeCreditSale('s2', 'cust-1', 300, 3),  // still unpaid, only 3 days old
  ];

  const anchor = findOldestUnsettledUdhaarDate(customer, sales, []);
  assert.equal(anchor, daysAgoIso(3));

  const eval7d = evaluateCustomerDueStatus(
    customer,
    sales,
    [],
    createDefaultReminderSettings(),
    baseNowMs
  );
  assert.equal(eval7d.isDue, false);
  assert.equal(eval7d.cycleNumber, 0);

  // With custom 3-day interval, it IS due!
  const eval3d = evaluateCustomerDueStatus(
    customer,
    sales,
    [],
    { enabled: true, intervalDays: 3, browserPushEnabled: false, updatedAt: '' },
    baseNowMs
  );
  assert.equal(eval3d.isDue, true);
  assert.equal(eval3d.cycleNumber, 1);
});

test('reconcileDueNotifications triggers once per cycle, prevents duplicates, and auto-clears when paid', () => {
  const settings = createDefaultReminderSettings();
  const overdueCustomer = makeCustomer({
    id: 'cust-due',
    name: 'Suresh',
    outstandingBalance: 1200,
    createdAt: daysAgoIso(9),
  });
  const freshCustomer = makeCustomer({
    id: 'cust-fresh',
    name: 'Mahesh',
    outstandingBalance: 400,
    createdAt: daysAgoIso(2),
  });
  const sales = [
    makeCreditSale('s-due', 'cust-due', 1200, 9),
    makeCreditSale('s-fresh', 'cust-fresh', 400, 2),
  ];

  let seq = 0;
  const firstRun = reconcileDueNotifications({
    shopId: 'shop-1',
    ownerUid: 'shop-1',
    customers: [overdueCustomer, freshCustomer],
    sales,
    ledger: [],
    settings,
    existingNotifications: [],
    nowIso: new Date(baseNowMs).toISOString(),
    idFactory: () => `notif-${++seq}`,
  });

  // Only the overdue customer gets a notification (to the shopkeeper, linking to their ledger)
  assert.equal(firstRun.newlyCreated.length, 1);
  assert.equal(firstRun.newlyCreated[0].customerId, 'cust-due');
  assert.equal(firstRun.newlyCreated[0].pendingAmount, 1200);
  assert.equal(firstRun.newlyCreated[0].actionUrl, '/customers/cust-due');
  assert.equal(firstRun.newlyCreated[0].status, 'active');

  // Re-running immediately must NOT create a duplicate notification
  const secondRun = reconcileDueNotifications({
    shopId: 'shop-1',
    ownerUid: 'shop-1',
    customers: [overdueCustomer, freshCustomer],
    sales,
    ledger: [],
    settings,
    existingNotifications: firstRun.nextNotifications,
    nowIso: new Date(baseNowMs + 60 * 60 * 1000).toISOString(),
    idFactory: () => `notif-${++seq}`,
  });
  assert.equal(secondRun.newlyCreated.length, 0);
  assert.equal(secondRun.nextNotifications.length, 1);

  // When overdue customer pays off full balance -> reminder stops & auto-clears
  const clearedCustomer: Customer = { ...overdueCustomer, outstandingBalance: 0, totalPaid: 1200 };
  const thirdRun = reconcileDueNotifications({
    shopId: 'shop-1',
    ownerUid: 'shop-1',
    customers: [clearedCustomer, freshCustomer],
    sales,
    ledger: [],
    settings,
    existingNotifications: secondRun.nextNotifications,
    nowIso: new Date(baseNowMs + 2 * 60 * 60 * 1000).toISOString(),
    idFactory: () => `notif-${++seq}`,
  });

  assert.equal(thirdRun.newlyCreated.length, 0);
  assert.equal(thirdRun.autoClearedCount, 1);
  assert.equal(thirdRun.nextNotifications[0].status, 'cleared');
  assert.equal(thirdRun.nextNotifications[0].pendingAmount, 0);
});

test('reconcileDueNotifications creates no new alerts when reminders are disabled', () => {
  const overdueCustomer = makeCustomer({
    id: 'cust-due',
    outstandingBalance: 900,
    createdAt: daysAgoIso(12),
  });
  const result = reconcileDueNotifications({
    shopId: 'shop-1',
    ownerUid: 'shop-1',
    customers: [overdueCustomer],
    sales: [makeCreditSale('s1', 'cust-due', 900, 12)],
    ledger: [],
    settings: { enabled: false, intervalDays: 7, browserPushEnabled: false, updatedAt: '' },
    existingNotifications: [],
    nowIso: new Date(baseNowMs).toISOString(),
  });

  assert.equal(result.newlyCreated.length, 0);
  assert.equal(result.nextNotifications.length, 0);
});
