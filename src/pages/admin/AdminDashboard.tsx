import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BadgeIndianRupee,
  Check,
  Crown,
  MessageSquareText,
  QrCode,
  RefreshCw,
  Users,
  X,
} from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { StatCard } from '../../components/common/StatCard';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { fetchAdminOverview, reviewPremiumRequest } from '../../services/adminService';
import type { PremiumPaymentRequest, SupportTicket, UserProfile } from '../../types/models';
import { formatINR } from '../../utils/finance';

export function AdminDashboard() {
  const { adminToken } = useAdminAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [requests, setRequests] = useState<PremiumPaymentRequest[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [premiumPriceInr, setPremiumPriceInr] = useState<number>(199);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(() => {
    if (!adminToken) return;
    setError(null);
    fetchAdminOverview(adminToken)
      .then((overview) => {
        setUsers(overview.users);
        setRequests(overview.premiumRequests);
        setTickets(overview.supportTickets || []);
        if (overview.siteSettings?.premiumPriceInr) {
          setPremiumPriceInr(overview.siteSettings.premiumPriceInr);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load admin overview.');
      });
  }, [adminToken]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleReview = async (id: string, action: 'approve' | 'reject') => {
    if (!adminToken) return;
    setBusyId(id);
    setError(null);
    try {
      await reviewPremiumRequest(adminToken, id, action);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review action failed.');
    } finally {
      setBusyId(null);
    }
  };

  const freeCount = users.filter((u) => u.subscriptionStatus === 'free').length;
  const premiumCount = users.filter((u) => u.subscriptionStatus === 'premium_active').length;
  const pendingReqs = requests.filter((r) => r.status === 'pending').length;
  const openTickets = tickets.filter((t) => t.status === 'pending').length;
  const verifiedRevenue = requests
    .filter((r) => r.status === 'approved')
    .reduce((sum, r) => sum + r.amount, 0);

  return (
    <AdminLayout title="Admin Dashboard">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard label="Total Dukandars" value={String(users.length)} icon={Users} tone="blue" />
          <StatCard label="Free Users" value={String(freeCount)} icon={Users} tone="cyan" />
          <StatCard label="Premium Users" value={String(premiumCount)} icon={Crown} tone="amber" />
          <StatCard label="Pending UTRs" value={String(pendingReqs)} icon={BadgeIndianRupee} tone="rose" />
          <StatCard label="Verified Revenue" value={formatINR(verifiedRevenue)} icon={BadgeIndianRupee} tone="emerald" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <button
            type="button"
            onClick={() => navigate('/admin/qr-management')}
            className="glass-surface hover:border-cyan-400/40 rounded-3xl p-4 text-left flex items-center gap-3 transition-all hover:-translate-y-0.5"
          >
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 text-cyan-300 flex items-center justify-center shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Upload QR from Gallery</div>
              <div className="text-xs text-slate-400">
                Set UPI QR for {formatINR(premiumPriceInr)} payments
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigate('/admin/premium-requests')}
            className="glass-surface hover:border-amber-400/40 rounded-3xl p-4 text-left flex items-center gap-3 transition-all hover:-translate-y-0.5"
          >
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-300 flex items-center justify-center shrink-0">
              <BadgeIndianRupee className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Verify UTR Requests</div>
              <div className="text-xs text-slate-400">{pendingReqs} pending review</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigate('/admin/users')}
            className="glass-surface hover:border-blue-400/40 rounded-3xl p-4 text-left flex items-center gap-3 transition-all hover:-translate-y-0.5"
          >
            <div className="w-10 h-10 rounded-2xl bg-blue-500/15 text-blue-300 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Manage Dukandars</div>
              <div className="text-xs text-slate-400">Upgrade or suspend shops</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigate('/admin/support')}
            className="glass-surface hover:border-emerald-400/40 rounded-3xl p-4 text-left flex items-center gap-3 transition-all hover:-translate-y-0.5"
          >
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-300 flex items-center justify-center shrink-0">
              <MessageSquareText className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Support Messages</div>
              <div className="text-xs text-slate-400">{openTickets} pending tickets</div>
            </div>
          </button>
        </div>

        {error ? (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs">
            {error}
          </div>
        ) : null}

        <div className="glass-surface rounded-3xl overflow-hidden">
          <div className="px-5 py-4 border-b border-blue-400/15 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Recent Premium UTR Requests</h2>
              <p className="text-xs text-slate-400">
                All submitted {formatINR(premiumPriceInr)} UPI UTR numbers appear here for verification.
              </p>
            </div>
            <button
              type="button"
              onClick={loadData}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-blue-400/20 text-xs text-slate-200"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-blue-400/15 text-xs text-slate-400">
                <tr>
                  <th className="py-3 px-4 font-medium">UTR Number</th>
                  <th className="py-3 px-4 font-medium">Shop / Shopkeeper</th>
                  <th className="py-3 px-4 font-medium">Phone</th>
                  <th className="py-3 px-4 font-medium">Amount</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-400/10">
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-xs text-slate-400">
                      No UTR payment requests submitted yet.
                    </td>
                  </tr>
                ) : (
                  requests.slice(0, 10).map((r) => (
                    <tr key={r.id}>
                      <td className="py-3 px-4 font-mono-num font-semibold text-cyan-300">{r.utrNumber}</td>
                      <td className="py-3 px-4">
                        <div className="text-white font-medium">{r.shopName}</div>
                        <div className="text-xs text-slate-400">{r.shopkeeperName}</div>
                      </td>
                      <td className="py-3 px-4 font-mono-num text-xs text-slate-300">
                        {r.phoneNumber || r.email || '—'}
                      </td>
                      <td className="py-3 px-4 font-mono-num text-white">{formatINR(r.amount)}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-xs uppercase font-semibold ${
                            r.status === 'approved'
                              ? 'text-emerald-300'
                              : r.status === 'rejected'
                                ? 'text-rose-300'
                                : 'text-amber-300'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {r.status === 'pending' ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              disabled={busyId === r.id}
                              onClick={() => void handleReview(r.id, 'approve')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Approve</span>
                            </button>
                            <button
                              type="button"
                              disabled={busyId === r.id}
                              onClick={() => void handleReview(r.id, 'reject')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600/80 hover:bg-rose-500 text-white text-xs font-medium"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Reject</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">Reviewed</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
