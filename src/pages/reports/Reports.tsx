import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Download, ShieldCheck } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { AppLayout } from '../../components/layout/AppLayout';
import { StatCard } from '../../components/common/StatCard';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { listSales } from '../../services/salesService';
import { listPayments } from '../../services/paymentService';
import { exportSalesToCsv } from '../../services/reportService';
import type { PaymentRecord, Sale } from '../../types/models';
import { formatINR } from '../../utils/finance';

export function Reports() {
  const { language, t } = useLanguage();
  const { user, shopProfile } = useAuth();
  const navigate = useNavigate();
  const isHindi = language === 'hi';
  const shopId = shopProfile?.id || user?.uid;

  const [sales, setSales] = useState<Sale[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);

  useEffect(() => {
    if (!user || !shopId) return;
    listSales(shopId).then(setSales).catch(console.warn);
    listPayments(shopId).then(setPayments).catch(console.warn);
  }, [user, shopId]);

  const summary = useMemo(() => {
    const active = sales.filter((s) => s.status !== 'cancelled');
    return {
      totalSales: active.reduce((a, b) => a + b.finalTotal, 0),
      pendingDues: active.reduce((a, b) => a + b.dueAmount, 0),
      salesCount: active.length,
      totalCollections: payments.reduce((a, b) => a + b.amount, 0),
      cashSales: active.filter((s) => s.paymentMethod === 'cash').reduce((a, b) => a + b.finalTotal, 0),
      upiSales: active.filter((s) => s.paymentMethod === 'upi').reduce((a, b) => a + b.finalTotal, 0),
      udhaarSales: active.filter((s) => s.paymentMethod === 'udhaar').reduce((a, b) => a + b.finalTotal, 0),
    };
  }, [sales, payments]);

  const methodChartData = [
    { name: 'Cash', amount: summary.cashSales },
    { name: 'UPI', amount: summary.upiSales },
    { name: 'Udhaar', amount: summary.udhaarSales },
  ];

  return (
    <AppLayout title={t('nav.reports')}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-400/35 text-emerald-200 text-xs font-semibold"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{isHindi ? 'JSON बैकअप व रिस्टोर' : 'JSON Backup & Restore'}</span>
          </button>
          <button
            type="button"
            disabled={sales.length === 0}
            onClick={() => exportSalesToCsv(sales)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Sales" value={formatINR(summary.totalSales)} icon={BarChart3} tone="blue" />
          <StatCard label="Total Collections" value={formatINR(summary.totalCollections)} icon={BarChart3} tone="emerald" />
          <StatCard label="Pending Dues" value={formatINR(summary.pendingDues)} icon={BarChart3} tone="rose" />
          <StatCard label="Sales Count" value={String(summary.salesCount)} icon={BarChart3} tone="cyan" />
        </div>

        <div className="glass-surface rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Payment Method Breakdown</h2>
          <div className="h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={methodChartData}>
                <XAxis dataKey="name" stroke="#94A3B8" fontSize={12} />
                <YAxis stroke="#94A3B8" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F1B38',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: '12px',
                    color: '#F8FAFC',
                  }}
                />
                <Bar dataKey="amount" fill="#3B82F6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
