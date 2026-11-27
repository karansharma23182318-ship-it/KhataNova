import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, MessageSquareText, RefreshCw, Send } from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { useAdminAuth } from '../../context/AdminAuthContext';
import {
  fetchAdminOverview,
  fetchSupportTicketMessagesForAdmin,
  replyToSupportTicketAsAdmin,
} from '../../services/adminService';
import type { SupportMessage, SupportTicket } from '../../types/models';

export function SupportManagement() {
  const { adminToken } = useAdminAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'replied' | 'resolved'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTickets = useCallback(() => {
    if (!adminToken) return;
    setError(null);
    fetchAdminOverview(adminToken)
      .then((overview) => {
        setTickets(overview.supportTickets || []);
        setSelectedId((prev) => {
          if (prev && overview.supportTickets?.some((t) => t.id === prev)) return prev;
          return overview.supportTickets?.[0]?.id || null;
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load support tickets.');
      });
  }, [adminToken]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const loadMessages = useCallback(
    (ticketId: string) => {
      if (!adminToken) return;
      fetchSupportTicketMessagesForAdmin(adminToken, ticketId)
        .then(setMessages)
        .catch(() => setMessages([]));
    },
    [adminToken]
  );

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  const selectedTicket = tickets.find((t) => t.id === selectedId) || null;
  const visibleTickets =
    filter === 'all' ? tickets : tickets.filter((t) => t.status === filter);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken || !selectedTicket || !replyText.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await replyToSupportTicketAsAdmin(
        adminToken,
        selectedTicket.id,
        replyText.trim(),
        'replied'
      );
      setReplyText('');
      setTickets((prev) => prev.map((t) => (t.id === res.ticket.id ? res.ticket : t)));
      if (res.message) {
        setMessages((prev) => [...prev, res.message!]);
      } else {
        loadMessages(selectedTicket.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reply.');
    } finally {
      setSending(false);
    }
  };

  const handleResolve = async () => {
    if (!adminToken || !selectedTicket) return;
    setSending(true);
    setError(null);
    try {
      const res = await replyToSupportTicketAsAdmin(
        adminToken,
        selectedTicket.id,
        replyText.trim(),
        'resolved'
      );
      setReplyText('');
      setTickets((prev) => prev.map((t) => (t.id === res.ticket.id ? res.ticket : t)));
      if (res.message) {
        setMessages((prev) => [...prev, res.message!]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resolve ticket.');
    } finally {
      setSending(false);
    }
  };

  return (
    <AdminLayout title="Support Messages">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {(['all', 'pending', 'replied', 'resolved'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-medium capitalize border transition-colors ${
                  filter === tab
                    ? 'bg-blue-600 text-white border-blue-400/50'
                    : 'bg-[#0D1A38] text-slate-300 border-blue-400/20 hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={loadTickets}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-blue-400/20 text-xs text-slate-200"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh ({tickets.length})</span>
          </button>
        </div>

        {error ? (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-5 glass-surface rounded-2xl p-3 space-y-2 max-h-[540px] overflow-y-auto">
            {visibleTickets.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400 space-y-2">
                <MessageSquareText className="w-8 h-8 text-slate-500 mx-auto" />
                <p>No shopkeeper support tickets in this view.</p>
              </div>
            ) : (
              visibleTickets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-colors space-y-1 ${
                    selectedId === t.id
                      ? 'bg-blue-600/20 border-cyan-400/40'
                      : 'bg-[#0A142D]/70 border-blue-400/10 hover:border-blue-400/30'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white truncate">{t.subject}</span>
                    <span
                      className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-md shrink-0 ${
                        t.status === 'resolved'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : t.status === 'replied'
                            ? 'bg-cyan-500/15 text-cyan-300'
                            : 'bg-amber-500/15 text-amber-300'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>
                  <div className="text-xs text-cyan-200/90">
                    {t.shopName} · {t.senderName} {t.phoneNumber ? `(${t.phoneNumber})` : ''}
                  </div>
                  <div className="text-xs text-slate-400 truncate">{t.lastMessagePreview}</div>
                </button>
              ))
            )}
          </div>

          <div className="lg:col-span-7 glass-surface-elevated rounded-2xl p-5 flex flex-col min-h-[420px]">
            {selectedTicket ? (
              <>
                <div className="pb-3 border-b border-blue-400/15 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-white">{selectedTicket.subject}</h2>
                    <p className="text-xs text-slate-400">
                      {selectedTicket.shopName} ({selectedTicket.senderName}) ·{' '}
                      {selectedTicket.phoneNumber || 'No phone'}
                    </p>
                  </div>
                  {selectedTicket.status !== 'resolved' ? (
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => void handleResolve()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Mark Resolved</span>
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-emerald-300 uppercase">
                      Resolved
                    </span>
                  )}
                </div>

                <div className="flex-1 py-4 space-y-3 max-h-[320px] overflow-y-auto">
                  {messages.length === 0 ? (
                    <p className="text-xs text-slate-400">No messages in thread.</p>
                  ) : (
                    messages.map((m) => (
                      <div
                        key={m.id}
                        className={`p-3.5 rounded-xl text-sm ${
                          m.senderRole === 'admin'
                            ? 'bg-blue-600/20 border border-blue-400/30 text-white ml-6'
                            : 'bg-[#0A142D] border border-blue-400/15 text-slate-200 mr-6'
                        }`}
                      >
                        <div className="text-[11px] text-slate-400 mb-1">
                          {m.senderName} ({m.senderRole}) ·{' '}
                          {new Date(m.createdAt).toLocaleString('en-IN')}
                        </div>
                        <div>{m.text}</div>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={(e) => void handleSendReply(e)} className="pt-3 border-t border-blue-400/15 flex gap-2">
                  <input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write an official admin reply..."
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    type="submit"
                    disabled={sending || !replyText.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{sending ? 'Sending...' : 'Reply'}</span>
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
                Select a support ticket on the left to view messages and reply.
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
