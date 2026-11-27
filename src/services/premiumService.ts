import type {
  AdminPaymentSettings,
  AdminSiteSettings,
  PremiumPaymentRequest,
} from '../types/models';
import { publicApiFetch, shopApiFetch } from './apiClient';

export async function getActiveAdminPaymentSettings(): Promise<{
  settings: AdminPaymentSettings | null;
  unavailableReason?: 'offline' | 'permission' | 'unknown';
}> {
  try {
    const res = await publicApiFetch<{ settings: AdminPaymentSettings | null }>(
      '/api/shop/premium/settings',
      { method: 'GET' }
    );
    return { settings: res.settings };
  } catch {
    return { settings: null, unavailableReason: 'unknown' };
  }
}

export async function getActiveSiteSettings(): Promise<AdminSiteSettings | null> {
  try {
    const res = await publicApiFetch<{ settings: AdminSiteSettings }>(
      '/api/shop/site-settings',
      { method: 'GET' }
    );
    return res.settings;
  } catch {
    return null;
  }
}

export async function getUserPremiumRequests(_uid: string): Promise<PremiumPaymentRequest[]> {
  const res = await shopApiFetch<{ requests: PremiumPaymentRequest[] }>(
    '/api/shop/premium/requests',
    { method: 'GET' }
  );
  return res.requests;
}

export async function submitPremiumPaymentRequest(
  payload: Omit<PremiumPaymentRequest, 'id' | 'status' | 'createdAt'>
): Promise<string> {
  const res = await shopApiFetch<{ request: PremiumPaymentRequest }>(
    '/api/shop/premium/requests',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
  return res.request.id;
}
