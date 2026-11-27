import type { Sale } from '../types/models';
import { shopApiFetch } from './apiClient';
import { readShopVault, writeShopVault } from './localVault';

export async function listSales(shopId: string): Promise<Sale[]> {
  try {
    const res = await shopApiFetch<{ sales: Sale[] }>('/api/shop/sales', {
      method: 'GET',
    });
    writeShopVault(shopId, { sales: res.sales });
    return res.sales;
  } catch (err) {
    const cached = readShopVault(shopId)?.sales;
    if (cached && cached.length > 0) return cached;
    throw err;
  }
}

export async function getSaleById(saleId: string): Promise<Sale | null> {
  try {
    const res = await shopApiFetch<{ sale: Sale }>(
      `/api/shop/sales/${encodeURIComponent(saleId)}`,
      { method: 'GET' }
    );
    return res.sale;
  } catch {
    return null;
  }
}

export async function createAtomicSale(
  shopId: string,
  _uid: string,
  payload: Omit<
    Sale,
    | 'id'
    | 'invoiceId'
    | 'shopId'
    | 'paidAmount'
    | 'dueAmount'
    | 'status'
    | 'createdByUid'
    | 'createdAt'
    | 'updatedAt'
  >
): Promise<{ saleId: string; invoiceId: string }> {
  const res = await shopApiFetch<{ saleId: string; invoiceId: string; sale?: Sale }>('/api/shop/sales', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (res.sale) {
    const vault = readShopVault(shopId);
    const existing = vault?.sales || [];
    writeShopVault(shopId, {
      sales: [res.sale, ...existing.filter((s) => s.id !== res.sale!.id)],
    });
  }
  void Promise.all([
    shopApiFetch<{ customers: NonNullable<ReturnType<typeof readShopVault>>['customers'] }>(
      '/api/shop/customers',
      { method: 'GET' }
    ),
    shopApiFetch<{ payments: NonNullable<ReturnType<typeof readShopVault>>['payments'] }>(
      '/api/shop/payments',
      { method: 'GET' }
    ),
    shopApiFetch<{ ledger: NonNullable<ReturnType<typeof readShopVault>>['ledger'] }>(
      '/api/shop/ledger',
      { method: 'GET' }
    ),
  ])
    .then(([cRes, pRes, lRes]) => {
      writeShopVault(shopId, {
        customers: cRes.customers,
        payments: pRes.payments,
        ledger: lRes.ledger,
      });
    })
    .catch(() => {
      // Background vault refresh
    });
  return { saleId: res.saleId, invoiceId: res.invoiceId };
}
