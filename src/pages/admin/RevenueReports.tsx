import React, { useCallback, useEffect, useState } from 'react';
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BadgeIndianRupee, Crown, Download, RefreshCw, TrendingUp, Users } from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { StatCard } from '../../components/common/StatCard';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { fetchAdminOverview } from '../../services/adminService';
import type { PremiumPaymentRequest, UserProfile } from '../../types/models';
import { formatINR, getLocalDateKey } from '../../utils/finance';

export function RevenueReports() {
  const { adminToken } = useAdminAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [requests, setRequests] = useState<PremiumPaymentRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadReports = useCallback(() => {
    if (!adminToken) return;
    setError(null);
    fetchAdminOverview(adminToken)
      .then((overview) => {
        setUsers(overview.users || []);
        setRequests(overview.premiumRequests || []);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load reports.');
      });
  }, [adminToken]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const approvedReqs = requests.filter((r) => r.status === 'approved');
  const pendingReqs = requests.filter((r) => r.status === 'pending');
  const rejectedReqs = requests.filter((r) => r.status === 'rejected');

  const verifiedRevenue = approvedReqs.reduce((s, r) => s + r.amount, 0);
  const pendingPipeline = pendingReqs.reduce((s, r) => s + r.amount, 0);
  const premiumUsers = users.filter((u) => u.subscriptionStatus === 'premium_active').length;
  const freeUsers = users.filter((u) => u.subscriptionStatus === 'free').length;
  const conversionRate =
    users.length > 0 ? Math.round((premiumUsers / users.length) * 100) : 0;

  const chartData = [
    { name: 'Verified Revenue', amount: verifiedRevenue },
    { name: 'Pending UTR', amount: pendingPipeline },
    {
      name: 'Rejected',
      amount: rejectedReqs.reduce((s, r) => s + r.amount, 0),
    },
  ];

  const handleExportCsv = () => {
    const header = ['Type', 'ID/UTR', 'Name/Shop', 'Phone/Email', 'Amount', 'Status', 'Date'];
    const rows = [
      ...requests.map((r) => [
        'UTR_REQUEST',
        r.utrNumber,
        `${r.shopName} (${r.shopkeeperName})`,
        r.phoneNumber || r.email || '',
        String(r.amount),
        r.status,
        r.paymentDate,
      ]),
      ...users.map((u) => [
        'USER',
        u.uid,
        u.displayName,
        u.phoneNumber || u.email || '',
        '0',
        `${u.subscriptionStatus}/${u.accountStatus}`,
        u.createdAt.slice(0, 10),
      ]),
    ];

    const csv = [header, ...rows]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `khatanova-admin-report-${getLocalDateKey()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout title="User & Revenue Reports">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-400">
            Live analytics from verified shopkeeper accounts &amp; UTR payment records.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadReports}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-blue-400/20 text-xs text-slate-200"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {error ? (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Verified Revenue"
            value={formatINR(verifiedRevenue)}
            icon={BadgeIndianRupee}
            tone="emerald"
          />
          <StatCard
            label="Pending UTR Pipeline"
            value={formatINR(pendingPipeline)}
            icon={BadgeIndianRupee}
            tone="amber"
          />
          <StatCard
            label="Paid / Free Users"
            value={`${premiumUsers} / ${freeUsers}`}
            icon={Users}
            tone="blue"
          />
          <StatCard
            label="Premium Conversion"
            value={`${conversionRate}%`}
            icon={TrendingUp}
            tone="cyan"
          />
        </div>

        <div className="glass-surface rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-300" />
              <span>Subscription Revenue Breakdown (INR)</span>
            </h2>
            <span className="text-xs text-slate-400">
              {approvedReqs.length} approved · {pendingReqs.length} pending
            </span>
          </div>
          <div className="h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0A142D',
                    borderColor: 'rgba(59,130,246,0.3)',
                    borderRadius: '12px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="amount" fill="#38bdf8" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
