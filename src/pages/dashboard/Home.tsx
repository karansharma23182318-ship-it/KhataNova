import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDownLeft,
  Banknote,
  BookOpenCheck,
  Calculator,
  Crown,
  Megaphone,
  Plus,
  QrCode,
  ReceiptIndianRupee,
  Smartphone,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AppLayout } from '../../components/layout/AppLayout';
import { StatCard } from '../../components/common/StatCard';
import { EmptyState } from '../../components/common/EmptyState';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import {
  computePast7DaysSalesTrend,
  formatINR,
  getLocalDateKey,
  getLocalMonthKey,
} from '../../utils/finance';
import { getActiveSiteSettings } from '../../services/premiumService';
import { listSales } from '../../services/salesService';
import { listCustomers } from '../../services/customerService';
import { listPayments } from '../../services/paymentService';
import type { Customer, PaymentRecord, Sale } from '../../types/models';

export function Home() {
  const { t, language } = useLanguage();
  const {
    user,
    isProMode,
    shopProfile,
    authLoading,
    authError,
    canRetryRedirect,
    profileWarning,
    loginWithGoogle,
    loginWithGoogleRedirect,
  } = useAuth();
  const navigate = useNavigate();

  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [noticeBanner, setNoticeBanner] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const shopId = shopProfile?.id || user?.uid;
  const isHindi = language === 'hi';
  const isPro = isProMode;

  useEffect(() => {
    let active = true;
    getActiveSiteSettings()
      .then((site) => {
        if (active && site?.noticeBanner) {
          setNoticeBanner(site.noticeBanner.trim());
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!user || !shopId) {
      setSales([]);
      setCustomers([]);
      setPayments([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    Promise.all([listSales(shopId), listCustomers(shopId), listPayments(shopId)])
      .then(([s, c, p]) => {
        if (!cancelled) {
          setSales(s);
          setCustomers(c);
          setPayments(p);
        }
      })
      .catch((err) => {
        console.warn('Dashboard data fetch error:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, shopId]);

  const metrics = useMemo(() => {
    const todayKey = getLocalDateKey();
    const monthKey = getLocalMonthKey();

    const activeSales = sales.filter((s) => s.status !== 'cancelled');
    const todaySales = activeSales.filter((s) => getLocalDateKey(s.createdAt) === todayKey);
    const monthSales = activeSales.filter((s) => getLocalMonthKey(s.createdAt) === monthKey);

    const sumByMethod = (list: Sale[], method: Sale['paymentMethod']) =>
      list.filter((s) => s.paymentMethod === method).reduce((acc, s) => acc + s.finalTotal, 0);

    const todayTotal = todaySales.reduce((acc, s) => acc + s.finalTotal, 0);
    const monthTotal = monthSales.reduce((acc, s) => acc + s.finalTotal, 0);

    const paymentsToday = payments
      .filter(
        (p) =>
          getLocalDateKey(p.paymentDate) === todayKey || getLocalDateKey(p.createdAt) === todayKey
      )
      .reduce((acc, p) => acc + p.amount, 0);

    const monthlyCollections = payments
      .filter(
        (p) =>
          getLocalMonthKey(p.paymentDate) === monthKey ||
          getLocalMonthKey(p.createdAt) === monthKey
      )
      .reduce((acc, p) => acc + p.amount, 0);

    const totalOutstanding = customers.reduce((acc, c) => acc + (c.outstandingBalance || 0), 0);
    const customersWithDues = customers.filter((c) => (c.outstandingBalance || 0) > 0).length;

    const totalPaidAcrossSales = activeSales.reduce((acc, s) => acc + (s.paidAmount || 0), 0);
    const totalSalesVolume = activeSales.reduce((acc, s) => acc + (s.finalTotal || 0), 0);
    const collectionRate =
      totalSalesVolume > 0 ? Math.min(100, Math.round((totalPaidAcrossSales / totalSalesVolume) * 100)) : 0;

    return {
      todayTotal,
      todayCash: sumByMethod(todaySales, 'cash'),
      todayUpi: sumByMethod(todaySales, 'upi'),
      todayUdhaar: sumByMethod(todaySales, 'udhaar'),
      paymentsToday,
      totalOutstanding,
      monthTotal,
      monthlyCollections,
      totalCustomers: customers.length,
      customersWithDues,
      collectionRate,
    };
  }, [sales, customers, payments]);

  const trendData = useMemo(() => computePast7DaysSalesTrend(sales), [sales]);

  const { sevenDayTotal, sevenDayBills, avgBillValue } = useMemo(() => {
    const total = trendData.reduce((acc, pt) => acc + pt.totalSales, 0);
    const bills = trendData.reduce((acc, pt) => acc + pt.saleCount, 0);
    return {
      sevenDayTotal: total,
      sevenDayBills: bills,
      avgBillValue: bills > 0 ? total / bills : 0,
    };
  }, [trendData]);

  return (
    <AppLayout title={shopProfile?.shopName || t('dashboard.title')}>
      <div className="space-y-6">
        {noticeBanner ? (
          <div className="glass-surface rounded-2xl px-4 py-3 border border-cyan-400/25 flex items-center gap-3 text-xs sm:text-sm text-cyan-100">
            <Megaphone className="w-4 h-4 text-cyan-300 shrink-0" />
            <span>{noticeBanner}</span>
          </div>
        ) : null}

        {!user ? (
          <div className="glass-surface-elevated rounded-3xl p-5 sm:p-6 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-white font-display">
                  {isHindi
                    ? 'अपनी दुकान को क्लाउड से जोड़ें'
                    : 'Connect your shop to Firebase'}
                </h2>
                <p className="text-xs sm:text-sm text-slate-300">
                  {isHindi
                    ? 'बिक्री, ग्राहक और उधार खाता सुरक्षित रखने के लिए Google से साइन इन करें।'
                    : 'Sign in with Google to save sales, customers, and digital khata records securely.'}
                </p>
              </div>
              <button
                type="button"
                disabled={authLoading}
                onClick={() => void loginWithGoogle()}
                className="px-5 py-2.5 min-h-[44px] rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-60 text-white text-sm font-semibold transition-all shadow-lg shadow-blue-950/40 whitespace-nowrap shrink-0"
              >
                {authLoading ? t('auth.signingIn') : t('auth.continueGoogle')}
              </button>
            </div>

            {authError ? (
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs leading-relaxed flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span>{authError}</span>
                {canRetryRedirect ? (
                  <button
                    type="button"
                    disabled={authLoading}
                    onClick={() => void loginWithGoogleRedirect()}
                    className="px-4 py-2 rounded-full bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/30 text-white text-xs font-medium whitespace-nowrap shrink-0"
                  >
                    {isHindi ? 'Redirect से लॉगिन करें' : 'Try Redirect Sign-In'}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : !shopProfile ? (
          <div className="glass-surface-elevated rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-white font-display">{t('auth.shopSetupTitle')}</h2>
              <p className="text-xs sm:text-sm text-slate-300">
                {profileWarning || t('auth.shopSetupSubtitle')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/setup')}
              className="px-5 py-2.5 min-h-[44px] rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-sm font-semibold transition-all whitespace-nowrap shrink-0"
            >
              {isHindi ? 'दुकान सेटअप करें' : 'Set Up Shop'}
            </button>
          </div>
        ) : profileWarning ? (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
            {profileWarning}
          </div>
        ) : null}

        {isPro ? (
          <section
            aria-label="Pro Business Pulse"
            className="pro-card rounded-3xl p-4 sm:p-6 border-amber-400/35"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-amber-400/15">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-2xl bg-amber-500/15 border border-amber-400/30 text-amber-300 flex items-center justify-center shrink-0">
                  <Crown className="w-4 h-4" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold tracking-wider uppercase text-amber-300">
                      KhataNova PRO
                    </span>
                    <span className="text-slate-500">·</span>
                    <span className="text-xs text-slate-300">
                      {isHindi ? 'बिज़नेस पल्स' : 'Business Pulse'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {isHindi
                      ? '7-दिन का रेवेन्यू, औसत बिल और वसूली प्रदर्शन'
                      : '7-day revenue velocity, average ticket size & collection efficiency'}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3.5">
              <div>
                <div className="text-[11px] text-slate-400">
                  {isHindi ? '7-दिन की बिक्री' : '7-Day Revenue'}
                </div>
                <div className="mt-0.5 text-lg font-bold text-amber-300 font-mono-num tabular-nums">
                  {formatINR(sevenDayTotal)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">
                  {isHindi ? 'औसत बिल राशि' : 'Avg Bill Value'}
                </div>
                <div className="mt-0.5 text-lg font-bold text-white font-mono-num tabular-nums">
                  {formatINR(avgBillValue)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">
                  {isHindi ? 'वसूली दर' : 'Collection Rate'}
                </div>
                <div className="mt-0.5 text-lg font-bold text-emerald-300 font-mono-num tabular-nums">
                  {metrics.collectionRate}%
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">
                  {isHindi ? '7-दिन के बिल' : '7-Day Bills'}
                </div>
                <div className="mt-0.5 text-lg font-bold text-cyan-300 font-mono-num tabular-nums">
                  {sevenDayBills}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300">{t('dashboard.quickActions')}</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <button
              type="button"
              onClick={() => navigate('/sales/new')}
              className={`glass-surface rounded-3xl p-3.5 sm:p-4 min-h-[64px] flex items-center gap-2.5 sm:gap-3 text-left transition-all hover:-translate-y-0.5 ${
                isPro ? 'hover:border-amber-400/45' : 'hover:border-blue-400/40'
              }`}
            >
              <span
                className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                  isPro ? 'bg-amber-500/15 text-amber-300' : 'bg-blue-600/20 text-blue-400'
                }`}
              >
                <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
              </span>
              <span className="text-xs sm:text-sm font-semibold text-white truncate">{t('dashboard.newSale')}</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/calculator')}
              className={`glass-surface rounded-3xl p-3.5 sm:p-4 min-h-[64px] flex items-center gap-2.5 sm:gap-3 text-left transition-all hover:-translate-y-0.5 ${
                isPro ? 'hover:border-amber-400/45' : 'hover:border-cyan-400/40'
              }`}
            >
              <span
                className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                  isPro ? 'bg-amber-500/15 text-amber-300' : 'bg-cyan-500/15 text-cyan-300'
                }`}
              >
                <Calculator className="w-4 h-4 sm:w-5 sm:h-5" />
              </span>
              <span className="text-xs sm:text-sm font-semibold text-white truncate">
                {isHindi ? 'रेट कैलकुलेटर' : 'Rate Calc'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/udhaar')}
              className={`glass-surface rounded-3xl p-3.5 sm:p-4 min-h-[64px] flex items-center gap-2.5 sm:gap-3 text-left transition-all hover:-translate-y-0.5 ${
                isPro ? 'hover:border-amber-400/45' : 'hover:border-cyan-400/40'
              }`}
            >
              <span className="w-10 h-10 rounded-2xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center shrink-0">
                <BookOpenCheck className="w-4 h-4 sm:w-5 sm:h-5" />
              </span>
              <span className="text-xs sm:text-sm font-semibold text-white truncate">{t('dashboard.addUdhaar')}</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/customers/add')}
              className={`glass-surface rounded-3xl p-3.5 sm:p-4 min-h-[64px] flex items-center gap-2.5 sm:gap-3 text-left transition-all hover:-translate-y-0.5 ${
                isPro ? 'hover:border-amber-400/45' : 'hover:border-blue-400/40'
              }`}
            >
              <span className="w-10 h-10 rounded-2xl bg-blue-500/15 text-blue-300 flex items-center justify-center shrink-0">
                <UserPlus className="w-4 h-4 sm:w-5 sm:h-5" />
              </span>
              <span className="text-xs sm:text-sm font-semibold text-white truncate">{t('dashboard.addCustomer')}</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/payments/take')}
              className={`glass-surface rounded-3xl p-3.5 sm:p-4 min-h-[64px] flex items-center gap-2.5 sm:gap-3 text-left transition-all hover:-translate-y-0.5 col-span-2 sm:col-span-1 ${
                isPro ? 'hover:border-amber-400/45' : 'hover:border-emerald-400/40'
              }`}
            >
              <span className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                <ArrowDownLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </span>
              <span className="text-xs sm:text-sm font-semibold text-white truncate">{t('dashboard.takePayment')}</span>
            </button>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-300">{t('dashboard.todayOverview')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <StatCard
              label={t('dashboard.todayTotalSales')}
              value={formatINR(metrics.todayTotal)}
              icon={ReceiptIndianRupee}
              tone={isPro ? 'amber' : 'blue'}
            />
            <StatCard
              label={t('dashboard.cashSales')}
              value={formatINR(metrics.todayCash)}
              icon={Banknote}
              tone="emerald"
            />
            <StatCard
              label={t('dashboard.upiSales')}
              value={formatINR(metrics.todayUpi)}
              icon={Smartphone}
              tone="cyan"
            />
            <StatCard
              label={t('dashboard.udhaarSales')}
              value={formatINR(metrics.todayUdhaar)}
              icon={BookOpenCheck}
              tone="amber"
            />
            <StatCard
              label={t('dashboard.paymentsToday')}
              value={formatINR(metrics.paymentsToday)}
              icon={Wallet}
              tone="emerald"
            />
            <StatCard
              label={t('dashboard.totalOutstanding')}
              value={formatINR(metrics.totalOutstanding)}
              icon={QrCode}
              tone="rose"
            />
          </div>
        </section>

        {/* 7-Day Daily Sales Trend Recharts Line Graph */}
        <section className="space-y-3">
          <div
            className={`rounded-3xl p-4 sm:p-6 space-y-4 ${
              isPro ? 'pro-card border-amber-400/30' : 'glass-surface'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 ${
                    isPro
                      ? 'bg-amber-500/15 border-amber-400/30 text-amber-300'
                      : 'bg-cyan-500/10 border-cyan-400/20 text-cyan-400'
                  }`}
                >
                  <TrendingUp className="w-4 h-4" />
                </span>
                <div>
                  <h2 className="text-sm sm:text-base font-semibold text-white font-display">
                    {isHindi ? 'पिछले 7 दिनों की बिक्री ट्रेंड' : 'Past 7 Days Sales Trend'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {isHindi
                      ? 'दैनिक कुल बिक्री से दुकान की ग्रोथ ट्रैक करें'
                      : 'Track daily total sales growth over the last 7 days'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-300 font-mono-num tabular-nums">
                <span className="text-slate-400">{isHindi ? 'कुल 7-दिन:' : '7D Total:'}</span>
                <span className={`font-semibold ${isPro ? 'text-amber-300' : 'text-cyan-300'}`}>
                  {formatINR(sevenDayTotal)}
                </span>
                <span className="text-slate-500">·</span>
                <span className="text-slate-300">
                  {sevenDayBills} {isHindi ? 'बिल' : 'bills'}
                </span>
              </div>
            </div>

            <div className="h-60 sm:h-64 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 10, right: 12, left: 0, bottom: 2 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={isPro ? 'rgba(245, 158, 11, 0.14)' : 'rgba(148, 163, 184, 0.14)'}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    stroke="#94A3B8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(148, 163, 184, 0.2)' }}
                  />
                  <YAxis
                    stroke="#94A3B8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={54}
                    allowDecimals={false}
                    domain={sevenDayTotal === 0 ? [0, 1000] : [0, 'auto']}
                    tickFormatter={(val: number) =>
                      val >= 1000 ? `₹${Math.round(val / 1000)}k` : `₹${val}`
                    }
                  />
                  <Tooltip
                    cursor={{
                      stroke: isPro ? 'rgba(251, 191, 36, 0.35)' : 'rgba(56, 189, 248, 0.35)',
                      strokeWidth: 1,
                    }}
                    contentStyle={{
                      backgroundColor: isPro ? '#0B1022' : '#0A142D',
                      borderColor: isPro ? 'rgba(245, 158, 11, 0.35)' : 'rgba(56, 189, 248, 0.3)',
                      borderRadius: '12px',
                      color: '#F8FAFC',
                      fontSize: '12px',
                    }}
                    formatter={(value: unknown, _name: unknown, item: { payload?: { saleCount?: number } }) => {
                      const amount = Number(value) || 0;
                      const count = item?.payload?.saleCount ?? 0;
                      return [
                        `${formatINR(amount)} (${count} ${isHindi ? 'बिल' : 'bills'})`,
                        isHindi ? 'दैनिक बिक्री' : 'Daily Sales',
                      ];
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="totalSales"
                    stroke={isPro ? '#F59E0B' : '#38BDF8'}
                    strokeWidth={isPro ? 3 : 2.5}
                    dot={{
                      r: 3.5,
                      fill: isPro ? '#F59E0B' : '#38BDF8',
                      strokeWidth: 0,
                    }}
                    activeDot={{
                      r: 6,
                      fill: isPro ? '#FBBF24' : '#67E8F9',
                      stroke: '#070F22',
                      strokeWidth: 2,
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {sevenDayTotal === 0 ? (
              <p className="text-xs text-slate-400">
                {isHindi
                  ? 'पिछले 7 दिनों की बिक्री यहाँ ग्राफ़ के रूप में दिखेगी — पहली बिक्री दर्ज करें।'
                  : 'Sales from the past 7 days will plot here automatically as you record bills.'}
              </p>
            ) : null}
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label={t('dashboard.monthlyTotalSales')}
            value={formatINR(metrics.monthTotal)}
            icon={ReceiptIndianRupee}
            tone={isPro ? 'amber' : 'blue'}
          />
          <StatCard
            label={t('dashboard.monthlyCollections')}
            value={formatINR(metrics.monthlyCollections)}
            icon={Wallet}
            tone="emerald"
          />
          <StatCard
            label={t('dashboard.totalCustomers')}
            value={String(metrics.totalCustomers)}
            icon={Users}
            tone="cyan"
          />
          <StatCard
            label={t('dashboard.customersWithDues')}
            value={String(metrics.customersWithDues)}
            icon={Users}
            tone="amber"
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-300">
            {t('dashboard.recentTransactions')}
          </h2>
          {loading ? (
            <div className="glass-surface rounded-3xl p-6 text-sm text-slate-400">
              {t('app.loading')}
            </div>
          ) : sales.length === 0 ? (
            <EmptyState
              icon={ReceiptIndianRupee}
              title={t('dashboard.emptyTitle')}
              description={t('dashboard.emptySubtitle')}
              actionLabel={t('dashboard.newSale')}
              onAction={() => navigate('/sales/new')}
            />
          ) : (
            <div className="glass-surface rounded-3xl overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-blue-400/15 text-xs text-slate-400">
                  <tr>
                    <th className="py-3 px-4 font-medium">Invoice</th>
                    <th className="py-3 px-4 font-medium">Customer</th>
                    <th className="py-3 px-4 font-medium">Method</th>
                    <th className="py-3 px-4 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-400/10">
                  {sales.slice(0, 8).map((sale) => (
                    <tr
                      key={sale.id}
                      onClick={() => navigate(`/sales/${sale.id}`)}
                      className="hover:bg-white/5 cursor-pointer transition-colors"
                    >
                      <td
                        className={`py-3 px-4 font-mono-num tabular-nums ${
                          isPro ? 'text-amber-300' : 'text-cyan-300'
                        }`}
                      >
                        {sale.invoiceId}
                      </td>
                      <td className="py-3 px-4 text-slate-200">
                        <div>{sale.customerName || 'Walk-in'}</div>
                        {sale.customerPhone ? (
                          <div className="text-[11px] text-slate-400 font-mono-num tabular-nums">
                            {sale.customerPhone}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 px-4 text-slate-300 uppercase text-xs">
                        {sale.paymentMethod}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-num tabular-nums font-semibold text-white">
                        {formatINR(sale.finalTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
