import React, { useCallback, useEffect, useState } from 'react';
import { Check, RefreshCw, X } from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { fetchAllPremiumRequests, reviewPremiumRequest } from '../../services/adminService';
import type { PremiumPaymentRequest } from '../../types/models';
import { formatINR } from '../../utils/finance';

export function PremiumRequests() {
  const { adminToken } = useAdminAuth();
  const [requests, setRequests] = useState<PremiumPaymentRequest[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRequests = useCallback(() => {
    if (!adminToken) return;
    setError(null);
    fetchAllPremiumRequests(adminToken)
      .then(setRequests)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load requests.'));
  }, [adminToken]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleReview = async (id: string, action: 'approve' | 'reject') => {
    if (!adminToken) return;
    setBusyId(id);
    setError(null);
    try {
      await reviewPremiumRequest(adminToken, id, action);
      loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update request status.');
    } finally {
      setBusyId(null);
    }
  };

  const visibleRequests =
    filter === 'all' ? requests : requests.filter((r) => r.status === filter);

  return (
    <AdminLayout title="Premium Payment Requests (UTR)">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {(['all', 'pending', 'approved', 'rejected'] as const).map((tab) => (
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
            onClick={loadRequests}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-blue-400/20 text-xs text-slate-200"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>

        {error ? (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs">
            {error}
          </div>
        ) : null}

        <div className="glass-surface rounded-2xl overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-blue-400/15 text-xs text-slate-400">
              <tr>
                <th className="py-3 px-4 font-medium">UTR Number</th>
                <th className="py-3 px-4 font-medium">Shopkeeper</th>
                <th className="py-3 px-4 font-medium">Shop</th>
                <th className="py-3 px-4 font-medium">Phone / Email</th>
                <th className="py-3 px-4 font-medium">Date</th>
                <th className="py-3 px-4 font-medium">Amount</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-400/10">
              {visibleRequests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-xs text-slate-400">
                    No premium payment requests found in this view.
                  </td>
                </tr>
              ) : (
                visibleRequests.map((r) => (
                  <tr key={r.id}>
                    <td className="py-3 px-4 font-mono-num font-semibold text-cyan-300">{r.utrNumber}</td>
                    <td className="py-3 px-4 text-white">{r.shopkeeperName}</td>
                    <td className="py-3 px-4 text-slate-300">{r.shopName}</td>
                    <td className="py-3 px-4 text-xs text-slate-300">
                      <div className="font-mono-num">{r.phoneNumber || '—'}</div>
                      <div className="text-slate-400">{r.email}</div>
                    </td>
                    <td className="py-3 px-4 font-mono-num text-xs text-slate-300">{r.paymentDate}</td>
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
                    <td className="py-3 px-4 text-right whitespace-nowrap">
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
                        <span className="text-xs text-slate-500">
                          {r.reviewedAt ? new Date(r.reviewedAt).toLocaleDateString('en-IN') : 'Done'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
