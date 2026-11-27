import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { fetchAllPremiumRequests } from '../../services/adminService';
import type { PremiumPaymentRequest } from '../../types/models';
import { formatINR } from '../../utils/finance';

export function PaymentHistory() {
  const { adminToken } = useAdminAuth();
  const [requests, setRequests] = useState<PremiumPaymentRequest[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(() => {
    if (!adminToken) return;
    setError(null);
    fetchAllPremiumRequests(adminToken)
      .then(setRequests)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load payment history.');
      });
  }, [adminToken]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const filtered = requests.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.utrNumber.toLowerCase().includes(q) ||
      r.shopName.toLowerCase().includes(q) ||
      r.shopkeeperName.toLowerCase().includes(q) ||
      (r.phoneNumber || '').toLowerCase().includes(q)
    );
  });

  const approvedTotal = requests
    .filter((r) => r.status === 'approved')
    .reduce((sum, r) => sum + r.amount, 0);

  return (
    <AdminLayout title="Payment History & Verified Revenue">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search UTR, shop or phone..."
              className="w-full sm:w-72 px-3.5 py-2 rounded-xl bg-[#0D1A38] border border-blue-400/20 text-sm text-white"
            />
            <span className="text-xs font-mono-num text-emerald-300 font-semibold">
              Verified Total: {formatINR(approvedTotal)}
            </span>
          </div>
          <button
            type="button"
            onClick={loadHistory}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-blue-400/20 text-xs text-slate-200"
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
                <th className="py-3 px-4 font-medium">UTR Reference</th>
                <th className="py-3 px-4 font-medium">Shopkeeper</th>
                <th className="py-3 px-4 font-medium">Shop</th>
                <th className="py-3 px-4 font-medium">Payment Date</th>
                <th className="py-3 px-4 font-medium">Amount</th>
                <th className="py-3 px-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-400/10">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-slate-400">
                    No Lifetime Premium UTR payment records found.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="py-3 px-4 font-mono-num font-semibold text-cyan-300">
                      {r.utrNumber}
                    </td>
                    <td className="py-3 px-4 text-white">{r.shopkeeperName}</td>
                    <td className="py-3 px-4 text-slate-300">{r.shopName}</td>
                    <td className="py-3 px-4 font-mono-num text-xs text-slate-300">
                      {r.paymentDate}
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
