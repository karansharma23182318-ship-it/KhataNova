import type { Customer, PaymentRecord, Sale } from '../types/models';

export interface CustomerDirectoryTotals {
  totalCustomers: number;
  activeCustomers: number;
  customersWithDues: number;
  settledCustomers: number;
  totalCredit: number;
  totalPaid: number;
  totalOpeningBalance: number;
  totalOutstanding: number;
  totalBillsCount: number;
  totalPaymentsCount: number;
}

export interface CustomerDirectoryEntry {
  customer: Customer;
  billCount: number;
  totalBilledAmount: number;
  lastBillDate: string | null;
  paymentCount: number;
  lastPaymentDate: string | null;
}

export type CustomerDirectoryFilter = 'all' | 'due' | 'settled';

export function computeCustomerDirectorySummary(
  customers: Customer[],
  sales: Sale[] = [],
  payments: PaymentRecord[] = []
): {
  totals: CustomerDirectoryTotals;
  entries: CustomerDirectoryEntry[];
} {
  const activeSales = sales.filter((s) => s.status !== 'cancelled');
  const salesByCustomer = new Map<string, Sale[]>();
  for (const s of activeSales) {
    if (!s.customerId) continue;
    const list = salesByCustomer.get(s.customerId) || [];
    list.push(s);
    salesByCustomer.set(s.customerId, list);
  }

  const paymentsByCustomer = new Map<string, PaymentRecord[]>();
  for (const p of payments) {
    if (!p.customerId) continue;
    const list = paymentsByCustomer.get(p.customerId) || [];
    list.push(p);
    paymentsByCustomer.set(p.customerId, list);
  }

  let activeCustomers = 0;
  let customersWithDues = 0;
  let settledCustomers = 0;
  let totalCredit = 0;
  let totalPaid = 0;
  let totalOpeningBalance = 0;
  let totalOutstanding = 0;
  let totalBillsCount = 0;
  let totalPaymentsCount = 0;

  const entries: CustomerDirectoryEntry[] = customers.map((customer) => {
    if (customer.isActive !== false) activeCustomers += 1;
    const due = Number(customer.outstandingBalance || 0);
    if (due > 0) customersWithDues += 1;
    else settledCustomers += 1;

    totalCredit += Number(customer.totalCredit || 0);
    totalPaid += Number(customer.totalPaid || 0);
    totalOpeningBalance += Number(customer.openingBalance || 0);
    totalOutstanding += due;

    const custSales = salesByCustomer.get(customer.id) || [];
    const custPayments = paymentsByCustomer.get(customer.id) || [];

    totalBillsCount += custSales.length;
    totalPaymentsCount += custPayments.length;

    const sortedSales = [...custSales].sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    );
    const sortedPayments = [...custPayments].sort((a, b) =>
      (b.paymentDate || b.createdAt || '').localeCompare(a.paymentDate || a.createdAt || '')
    );

    return {
      customer,
      billCount: custSales.length,
      totalBilledAmount: custSales.reduce((sum, s) => sum + Number(s.finalTotal || 0), 0),
      lastBillDate: sortedSales[0]?.createdAt || null,
      paymentCount: custPayments.length,
      lastPaymentDate: sortedPayments[0]?.paymentDate || sortedPayments[0]?.createdAt || null,
    };
  });

  return {
    totals: {
      totalCustomers: customers.length,
      activeCustomers,
      customersWithDues,
      settledCustomers,
      totalCredit,
      totalPaid,
      totalOpeningBalance,
      totalOutstanding,
      totalBillsCount,
      totalPaymentsCount,
    },
    entries,
  };
}

export function filterCustomerDirectory(
  entries: CustomerDirectoryEntry[],
  options: { query?: string; filter?: CustomerDirectoryFilter }
): CustomerDirectoryEntry[] {
  const filter = options.filter || 'all';
  const q = (options.query || '').trim().toLowerCase();

  return entries.filter(({ customer }) => {
    const due = Number(customer.outstandingBalance || 0);
    if (filter === 'due' && due <= 0) return false;
    if (filter === 'settled' && due > 0) return false;

    if (!q) return true;
    const haystack = [
      customer.name,
      customer.mobileNumber,
      customer.address || '',
      customer.notes || '',
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}
