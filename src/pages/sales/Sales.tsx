import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ReceiptIndianRupee, Search } from 'lucide-react';
import { AppLayout } from '../../components/layout/AppLayout';
import { EmptyState } from '../../components/common/EmptyState';
import { StatCard } from '../../components/common/StatCard';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { listSales } from '../../services/salesService';
import type { PaymentMethod, Sale } from '../../types/models';
import { formatINR } from '../../utils/finance';

export function Sales() {
  const { t } = useLanguage();
  const { user, shopProfile } = useAuth();
  const navigate = useNavigate();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [methodFilter, setMethodFilter] = useState<'all' | PaymentMethod>('all');
  const [search, setSearch] = useState('');

  const shopId = shopProfile?.id || user?.uid;

  useEffect(() => {
    if (!user || !shopId) {
      setSales([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listSales(shopId)
      .then((list) => {
        if (!cancelled) setSales(list);
      })
      .catch(console.warn)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, shopId]);

  const filtered = useMemo(() => {
    return sales.filter((s) => {
      if (methodFilter !== 'all' && s.paymentMethod !== methodFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchInvoice = s.invoiceId.toLowerCase().includes(q);
        const matchCustomer = (s.customerName || '').toLowerCase().includes(q);
        return matchInvoice || matchCustomer;
      }
      return true;
    });
  }, [sales, methodFilter, search]);

  const totals = useMemo(() => {
    const active = sales.filter((s) => s.status !== 'cancelled');
    return {
      totalSales: active.reduce((a, b) => a + b.finalTotal, 0),
      pendingDues: active.reduce((a, b) => a + b.dueAmount, 0),
    };
  }, [sales]);

  return (
    <AppLayout title={t('nav.sales')}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
            <StatCard label="Total Sales" value={formatINR(totals.totalSales)} icon={ReceiptIndianRupee} tone="blue" />
            <StatCard label="Pending Dues" value={formatINR(totals.pendingDues)} icon={ReceiptIndianRupee} tone="amber" />
          </div>
          <button
            type="button"
            onClick={() => navigate('/sales/new')}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 min-h-[44px] rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-sm font-semibold transition-all shadow-lg shadow-blue-950/40 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>{t('dashboard.newSale')}</span>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="flex items-center gap-1 p-1 bg-[#0D1A38] border border-blue-400/15 rounded-full overflow-x-auto">
            {(['all', 'cash', 'upi', 'udhaar'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setMethodFilter(tab)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  methodFilter === tab
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {tab === 'all' ? 'All' : tab.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="relative sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('common.search')}
              className="w-full pl-10 pr-4 py-2.5 min-h-[44px] rounded-full bg-[#0D1A38] border border-blue-400/20 text-sm text-white focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>

        {loading ? (
          <div className="glass-surface rounded-3xl p-6 text-sm text-slate-400">
            {t('app.loading')}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={ReceiptIndianRupee}
            title="No sales found"
            description="Create a new Cash, UPI, or Udhaar sale to generate an invoice and update your shop totals."
            actionLabel={t('dashboard.newSale')}
            onAction={() => navigate('/sales/new')}
          />
        ) : (
          <div className="glass-surface rounded-3xl overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-blue-400/15 text-xs text-slate-400">
                <tr>
                  <th className="py-3 px-4 font-medium">Invoice</th>
                  <th className="py-3 px-4 font-medium">Date</th>
                  <th className="py-3 px-4 font-medium">Customer</th>
                  <th className="py-3 px-4 font-medium">Method</th>
                  <th className="py-3 px-4 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-400/10">
                {filtered.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => navigate(`/sales/${s.id}`)}
                    className="hover:bg-white/5 cursor-pointer"
                  >
                    <td className="py-3 px-4 font-mono-num text-cyan-300">{s.invoiceId}</td>
                    <td className="py-3 px-4 text-slate-400 text-xs font-mono-num">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-slate-200">{s.customerName || 'Walk-in'}</td>
                    <td className="py-3 px-4 text-xs uppercase text-slate-300">{s.paymentMethod}</td>
                    <td className="py-3 px-4 text-right font-mono-num font-semibold text-white">
                      {formatINR(s.finalTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
