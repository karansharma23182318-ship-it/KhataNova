import type { LedgerEntry } from '../types/models';
import { shopApiFetch } from './apiClient';
import { readShopVault, writeShopVault } from './localVault';

export async function listCustomerLedger(
  shopId: string,
  customerId?: string
): Promise<LedgerEntry[]> {
  const query = customerId ? `?customerId=${encodeURIComponent(customerId)}` : '';
  try {
    const res = await shopApiFetch<{ ledger: LedgerEntry[] }>(`/api/shop/ledger${query}`, {
      method: 'GET',
    });
    if (!customerId) {
      writeShopVault(shopId, { ledger: res.ledger });
    }
    return res.ledger;
  } catch (err) {
    const cached = readShopVault(shopId)?.ledger;
    if (cached && cached.length > 0) {
      return customerId ? cached.filter((e) => e.customerId === customerId) : cached;
    }
    throw err;
  }
}
