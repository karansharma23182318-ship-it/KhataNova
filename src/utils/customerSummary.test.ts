import test from 'node:test';
import assert from 'node:assert/strict';
import type { Customer, PaymentRecord, Sale } from '../types/models';
import {
  computeCustomerDirectorySummary,
  filterCustomerDirectory,
} from './customerSummary';

const sampleCustomers: Customer[] = [
  {
    id: 'c1',
    shopId: 's1',
    name: 'Vinay Sharma',
    mobileNumber: '9876543210',
    address: 'Kanda Mohalla, Ward 4, Daltonganj',
    notes: 'Regular kirana buyer',
    openingBalance: 100,
    outstandingBalance: 450,
    totalCredit: 750,
    totalPaid: 300,
    isActive: true,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-20T10:00:00.000Z',
  },
  {
    id: 'c2',
    shopId: 's1',
    name: 'Ramesh Verma',
    mobileNumber: '9123456789',
    address: 'Station Road, Near Temple',
    notes: 'Pays via UPI',
    openingBalance: 0,
    outstandingBalance: 0,
    totalCredit: 500,
    totalPaid: 500,
    isActive: true,
    createdAt: '2026-11-05T10:00:00.000Z',
    updatedAt: '2026-11-21T10:00:00.000Z',
  },
];

const sampleSales: Sale[] = [
  {
    id: 'sale-1',
    invoiceId: 'INV-1',
    shopId: 's1',
    customerId: 'c1',
    customerName: 'Vinay Sharma',
    items: [],
    subtotal: 650,
    discount: 0,
    finalTotal: 650,
    paymentMethod: 'udhaar',
    paidAmount: 0,
    dueAmount: 650,
    status: 'completed',
    createdByUid: 'u1',
    createdAt: '2026-11-18T12:00:00.000Z',
    updatedAt: '2026-11-18T12:00:00.000Z',
  },
  {
    id: 'sale-cancelled',
    invoiceId: 'INV-C',
    shopId: 's1',
    customerId: 'c1',
    customerName: 'Vinay Sharma',
    items: [],
    subtotal: 999,
    discount: 0,
    finalTotal: 999,
    paymentMethod: 'cash',
    paidAmount: 999,
    dueAmount: 0,
    status: 'cancelled',
    createdByUid: 'u1',
    createdAt: '2026-11-19T12:00:00.000Z',
    updatedAt: '2026-11-19T12:00:00.000Z',
  },
];

const samplePayments: PaymentRecord[] = [
  {
    id: 'p1',
    receiptId: 'RCP-1',
    shopId: 's1',
    customerId: 'c1',
    customerName: 'Vinay Sharma',
    amount: 300,
    paymentMethod: 'cash',
    paymentDate: '2026-11-20T15:00:00.000Z',
    createdByUid: 'u1',
    createdAt: '2026-11-20T15:00:00.000Z',
  },
];

test('computeCustomerDirectorySummary totals all customer metrics and enriches per-customer bills/payments', () => {
  const { totals, entries } = computeCustomerDirectorySummary(
    sampleCustomers,
    sampleSales,
    samplePayments
  );

  assert.equal(totals.totalCustomers, 2);
  assert.equal(totals.customersWithDues, 1);
  assert.equal(totals.settledCustomers, 1);
  assert.equal(totals.totalCredit, 1250);
  assert.equal(totals.totalPaid, 800);
  assert.equal(totals.totalOpeningBalance, 100);
  assert.equal(totals.totalOutstanding, 450);
  assert.equal(totals.totalBillsCount, 1); // excludes cancelled sale
  assert.equal(totals.totalPaymentsCount, 1);

  assert.equal(entries[0].billCount, 1);
  assert.equal(entries[0].totalBilledAmount, 650);
  assert.equal(entries[0].paymentCount, 1);
  assert.equal(entries[0].lastPaymentDate, '2026-11-20T15:00:00.000Z');
  assert.equal(entries[1].billCount, 0);
});

test('filterCustomerDirectory filters by due/settled status and searches across name, phone, address, and notes', () => {
  const { entries } = computeCustomerDirectorySummary(sampleCustomers, sampleSales, samplePayments);

  assert.equal(filterCustomerDirectory(entries, { filter: 'due' }).length, 1);
  assert.equal(filterCustomerDirectory(entries, { filter: 'settled' }).length, 1);
  assert.equal(filterCustomerDirectory(entries, { query: 'Daltonganj' }).length, 1);
  assert.equal(filterCustomerDirectory(entries, { query: '912345' }).length, 1);
  assert.equal(filterCustomerDirectory(entries, { query: 'UPI' })[0].customer.id, 'c2');
});
