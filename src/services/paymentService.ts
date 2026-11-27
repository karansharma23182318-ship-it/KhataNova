import type { PaymentRecord } from '../types/models';
import { shopApiFetch } from './apiClient';
import { readShopVault, writeShopVault } from './localVault';

export async function listPayments(shopId: string): Promise<PaymentRecord[]> {
  try {
    const res = await shopApiFetch<{ payments: PaymentRecord[] }>('/api/shop/payments', {
      method: 'GET',
    });
    writeShopVault(shopId, { payments: res.payments });
    return res.payments;
  } catch (err) {
    const cached = readShopVault(shopId)?.payments;
    if (cached && cached.length > 0) return cached;
    throw err;
  }
}

export async function recordCustomerPayment(
  shopId: string,
  _uid: string,
  input: {
    customerId: string;
    amount: number;
    paymentMethod: 'cash' | 'upi' | 'other';
    paymentDate: string;
    notes?: string;
    allowAdvance?: boolean;
  }
): Promise<{ paymentId: string; receiptId: string; remainingBalance?: number }> {
  const result = await shopApiFetch<{
    paymentId: string;
    receiptId: string;
    remainingBalance?: number;
  }>('/api/shop/payments', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  // Refresh cached payments, customers & ledger into local vault
  void Promise.all([
    shopApiFetch<{ payments: PaymentRecord[] }>('/api/shop/payments', { method: 'GET' }),
    shopApiFetch<{ customers: NonNullable<ReturnType<typeof readShopVault>>['customers'] }>(
      '/api/shop/customers',
      { method: 'GET' }
    ),
    shopApiFetch<{ ledger: NonNullable<ReturnType<typeof readShopVault>>['ledger'] }>(
      '/api/shop/ledger',
      { method: 'GET' }
    ),
  ])
    .then(([pRes, cRes, lRes]) => {
      writeShopVault(shopId, {
        payments: pRes.payments,
        customers: cRes.customers,
        ledger: lRes.ledger,
      });
    })
    .catch(() => {
      // Background vault refresh
    });
  return result;
}
