import type { Customer } from '../types/models';
import { shopApiFetch } from './apiClient';
import { mirrorCustomerToFirestore } from './firebaseReminderData';
import { mergeCustomerIntoVault, readShopVault, writeShopVault } from './localVault';

export async function listCustomers(shopId: string): Promise<Customer[]> {
  try {
    const res = await shopApiFetch<{ customers: Customer[] }>('/api/shop/customers', {
      method: 'GET',
    });
    writeShopVault(shopId, { customers: res.customers });
    return res.customers;
  } catch (err) {
    const cached = readShopVault(shopId)?.customers;
    if (cached && cached.length > 0) return cached;
    throw err;
  }
}

export async function getCustomerById(customerId: string): Promise<Customer | null> {
  try {
    const res = await shopApiFetch<{ customer: Customer }>(
      `/api/shop/customers/${encodeURIComponent(customerId)}`,
      { method: 'GET' }
    );
    return res.customer;
  } catch {
    return null;
  }
}

export async function findDuplicateMobileCustomers(
  _shopId: string,
  mobileNumber: string
): Promise<Customer[]> {
  const cleaned = mobileNumber.trim();
  if (!cleaned) return [];
  const res = await shopApiFetch<{ customers: Customer[] }>(
    `/api/shop/customers?mobile=${encodeURIComponent(cleaned)}`,
    { method: 'GET' }
  );
  return res.customers;
}

export async function createCustomer(
  shopId: string,
  input: {
    name: string;
    mobileNumber: string;
    address?: string;
    notes?: string;
    openingBalance?: number;
  }
): Promise<string> {
  const res = await shopApiFetch<{ customer: Customer }>('/api/shop/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name.trim(),
      mobileNumber: input.mobileNumber.trim(),
      address: input.address?.trim() || '',
      notes: input.notes?.trim() || '',
      openingBalance: Number(input.openingBalance || 0),
    }),
  });
  mergeCustomerIntoVault(shopId, res.customer);
  void mirrorCustomerToFirestore(shopId, res.customer);
  return res.customer.id;
}

export async function updateCustomer(
  shopId: string,
  customerId: string,
  updates: Partial<Pick<Customer, 'name' | 'mobileNumber' | 'address' | 'notes' | 'isActive'>>
): Promise<void> {
  const res = await shopApiFetch<{ customer: Customer }>(
    `/api/shop/customers/${encodeURIComponent(customerId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }
  );
  mergeCustomerIntoVault(shopId, res.customer);
  void mirrorCustomerToFirestore(shopId, res.customer);
}
