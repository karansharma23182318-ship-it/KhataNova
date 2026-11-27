import type {
  AccountStatus,
  AdminAuditLog,
  AdminPaymentSettings,
  AdminSiteSettings,
  PremiumPaymentRequest,
  ShopProfile,
  SubscriptionStatus,
  SupportMessage,
  SupportTicket,
  UserProfile,
} from '../types/models';
import { adminApiFetch } from './apiClient';

export interface AdminOverviewData {
  users: UserProfile[];
  shops: Record<string, ShopProfile>;
  premiumRequests: PremiumPaymentRequest[];
  supportTickets: SupportTicket[];
  auditLogs: AdminAuditLog[];
  paymentSettings: AdminPaymentSettings | null;
  siteSettings: AdminSiteSettings;
}

export async function fetchAdminOverview(adminToken: string | null): Promise<AdminOverviewData> {
  return adminApiFetch<AdminOverviewData>('/api/admin/overview', adminToken, {
    method: 'GET',
  });
}

export async function fetchAllShopkeepersForAdmin(
  adminToken: string | null
): Promise<UserProfile[]> {
  const data = await fetchAdminOverview(adminToken);
  return data.users;
}

export async function fetchAllPremiumRequests(
  adminToken: string | null
): Promise<PremiumPaymentRequest[]> {
  const data = await fetchAdminOverview(adminToken);
  return data.premiumRequests;
}

export async function fetchAdminAuditLogs(
  adminToken: string | null
): Promise<AdminAuditLog[]> {
  const data = await fetchAdminOverview(adminToken);
  return data.auditLogs;
}

export async function saveAdminQrPaymentSettings(
  adminToken: string | null,
  input: {
    upiId: string;
    instructions: string;
    qrImageUrl?: string;
  }
): Promise<AdminPaymentSettings> {
  const res = await adminApiFetch<{ settings: AdminPaymentSettings }>(
    '/api/admin/payment-settings',
    adminToken,
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  );
  return res.settings;
}

export async function reviewPremiumRequest(
  adminToken: string | null,
  requestId: string,
  action: 'approve' | 'reject',
  rejectionReason?: string
): Promise<PremiumPaymentRequest> {
  const res = await adminApiFetch<{ request: PremiumPaymentRequest }>(
    `/api/admin/premium-requests/${encodeURIComponent(requestId)}/review`,
    adminToken,
    {
      method: 'POST',
      body: JSON.stringify({ action, ...(rejectionReason ? { rejectionReason } : {}) }),
    }
  );
  return res.request;
}

export async function updateShopkeeperStatus(
  adminToken: string | null,
  uid: string,
  patch: {
    subscriptionStatus?: SubscriptionStatus;
    accountStatus?: AccountStatus;
  }
): Promise<UserProfile> {
  const res = await adminApiFetch<{ user: UserProfile }>(
    `/api/admin/users/${encodeURIComponent(uid)}`,
    adminToken,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }
  );
  return res.user;
}

export async function fetchSupportTicketMessagesForAdmin(
  adminToken: string | null,
  ticketId: string
): Promise<SupportMessage[]> {
  const res = await adminApiFetch<{ messages: SupportMessage[] }>(
    `/api/admin/support/${encodeURIComponent(ticketId)}/messages`,
    adminToken,
    { method: 'GET' }
  );
  return res.messages;
}

export async function replyToSupportTicketAsAdmin(
  adminToken: string | null,
  ticketId: string,
  text: string,
  status?: 'replied' | 'resolved'
): Promise<{ ticket: SupportTicket; message?: SupportMessage }> {
  return adminApiFetch<{ ticket: SupportTicket; message?: SupportMessage }>(
    `/api/admin/support/${encodeURIComponent(ticketId)}/reply`,
    adminToken,
    {
      method: 'POST',
      body: JSON.stringify({ text, ...(status ? { status } : {}) }),
    }
  );
}

export async function saveAdminSiteSettings(
  adminToken: string | null,
  input: {
    noticeBanner?: string;
    supportPhone?: string;
    supportEmail?: string;
    premiumPriceInr?: number;
    planNotice?: string;
  }
): Promise<AdminSiteSettings> {
  const res = await adminApiFetch<{ settings: AdminSiteSettings }>(
    '/api/admin/site-settings',
    adminToken,
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  );
  return res.settings;
}
