import type { SupportMessage, SupportTicket } from '../types/models';
import { shopApiFetch } from './apiClient';

export async function listUserSupportTickets(_uid: string): Promise<SupportTicket[]> {
  const res = await shopApiFetch<{ tickets: SupportTicket[] }>('/api/shop/support', {
    method: 'GET',
  });
  return res.tickets;
}

export async function createSupportTicket(
  payload: Omit<SupportTicket, 'id' | 'status' | 'createdAt' | 'updatedAt'> & { message?: string }
): Promise<string> {
  const res = await shopApiFetch<{ ticket: SupportTicket }>('/api/shop/support', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.ticket.id;
}

export async function listTicketMessages(ticketId: string): Promise<SupportMessage[]> {
  const res = await shopApiFetch<{ messages: SupportMessage[] }>(
    `/api/shop/support/${encodeURIComponent(ticketId)}/messages`,
    { method: 'GET' }
  );
  return res.messages;
}
