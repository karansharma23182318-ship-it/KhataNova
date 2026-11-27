import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDownLeft,
  BookOpenCheck,
  Calendar,
  ClipboardList,
  ExternalLink,
  FileText,
  MapPin,
  MessageCircle,
  Phone,
  Search,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { AppLayout } from '../../components/layout/AppLayout';
import { EmptyState } from '../../components/common/EmptyState';
import { StatCard } from '../../components/common/StatCard';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { listCustomers } from '../../services/customerService';
import { fetchDynamicCustomerReminderData } from '../../services/firebaseReminderData';
import { listPayments } from '../../services/paymentService';
import { openWhatsAppTextLink } from '../../services/reportService';
import { listSales } from '../../services/salesService';
import type { Customer, PaymentRecord, Sale } from '../../types/models';
import {
  computeCustomerDirectorySummary,
  filterCustomerDirectory,
  type CustomerDirectoryFilter,
} from '../../utils/customerSummary';
import { formatINR } from '../../utils/finance';
import {
  buildCustomerWhatsAppReminderMessage,
  buildWhatsAppShareUrl,
} from '../../utils/share';

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function CustomerDirectory() {
  const { language, t } = useLanguage();
  const { user, isProMode, shopProfile } = useAuth();
  const navigate = useNavigate();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<CustomerDirectoryFilter>('all');
  const [remindingCustomerId, setRemindingCustomerId] = useState<string | null>(null);
  const [whatsappFallbackLink, setWhatsappFallbackLink] = useState<{
    customerName: string;
    url: string;
  } | null>(null);

  const shopId = shopProfile?.id || user?.uid;
  const isHindi = language === 'hi';
  const isPro = isProMode;

  useEffect(() => {
    if (!user || !shopId) {
      setCustomers([]);
      setSales([]);
      setPayments([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    Promise.all([listCustomers(shopId), listSales(shopId), listPayments(shopId)])
      .then(([c, s, p]) => {
        if (!cancelled) {
          setCustomers(c);
          setSales(s);
          setPayments(p);
        }
      })
      .catch(console.warn)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, shopId]);

  const { totals, entries } = useMemo(
    () => computeCustomerDirectorySummary(customers, sales, payments),
    [customers, sales, payments]
  );

  const filteredEntries = useMemo(
    () => filterCustomerDirectory(entries, { query: search, filter }),
    [entries, search, filter]
  );

  const handleSendWhatsAppReminder = async (c: Customer) => {
    setRemindingCustomerId(c.id);
    try {
      const fresh = await fetchDynamicCustomerReminderData({
        uid: user?.uid || shopId,
        customer: c,
        fallbackShop: shopProfile,
      });

      setCustomers((prev) =>
        prev.map((item) => (item.id === fresh.customer.id ? fresh.customer : item))
      );

      const message = buildCustomerWhatsAppReminderMessage({
        shopName: fresh.shopName,
        shopAddress: fresh.shopAddress,
        shopPhone: fresh.shopPhone,
        customerName: fresh.customer.name,
        outstandingBalance: fresh.customer.outstandingBalance || 0,
      });

      const whatsappUrl = buildWhatsAppShareUrl(message, fresh.customer.mobileNumber);
      setWhatsappFallbackLink({ customerName: fresh.customer.name, url: whatsappUrl });
      openWhatsAppTextLink(whatsappUrl);
    } finally {
      setRemindingCustomerId(null);
    }
  };

  return (
    <AppLayout title={t('nav.customerDirectory')}>
      <div className="space-y-6">
        {/* Overall Customer Totals Summary */}
        <section aria-label={isHindi ? 'ग्राहकों का कुल हिसाब' : 'All Customers Total Summary'} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-white font-display">
                {isHindi
                  ? 'सभी ग्राहकों का कुल सारांश (Total Summary)'
                  : 'All Customers Total Summary'}
              </h2>
              <p className="text-xs text-slate-400">
                {isHindi
                  ? 'कुल ग्राहक, कुल उधार, कुल जमा और कुल बाकी बकाया एक नज़र में'
                  : 'Combined totals across every saved customer account'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/customers/add')}
              className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-semibold whitespace-nowrap shrink-0"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{t('dashboard.addCustomer')}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <StatCard
              label={isHindi ? 'कुल ग्राहक' : 'Total Customers'}
              value={`${totals.totalCustomers} (${totals.customersWithDues} ${isHindi ? 'बाकी' : 'Due'})`}
              icon={Users}
              tone={isPro ? 'amber' : 'blue'}
            />
            <StatCard
              label={isHindi ? 'कुल उधार / बिल' : 'Total Credit Billed'}
              value={formatINR(totals.totalCredit)}
              icon={BookOpenCheck}
              tone="amber"
            />
            <StatCard
              label={isHindi ? 'कुल जमा राशि' : 'Total Paid'}
              value={formatINR(totals.totalPaid)}
              icon={Wallet}
              tone="emerald"
            />
            <StatCard
              label={isHindi ? 'कुल बाकी बकाया' : 'Total Balance Due'}
              value={formatINR(totals.totalOutstanding)}
              icon={ClipboardList}
              tone="rose"
            />
          </div>

          {/* Compact Combined Breakdown Strip */}
          <div
            className={`rounded-3xl px-4 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs border ${
              isPro ? 'pro-card border-amber-400/30' : 'glass-surface border-blue-400/20'
            }`}
          >
            <div className="flex flex-wrap items-center gap-4 text-slate-300">
              <span>
                {isHindi ? 'सक्रिय ग्राहक:' : 'Active:'}{' '}
                <strong className="text-white font-mono-num">{totals.activeCustomers}</strong>
              </span>
              <span>
                {isHindi ? 'हिसाब पूरा (₹0 बाकी):' : 'Settled (₹0 due):'}{' '}
                <strong className="text-emerald-300 font-mono-num">{totals.settledCustomers}</strong>
              </span>
              <span>
                {isHindi ? 'पिछला शुरुआती बकाया:' : 'Opening Balances:'}{' '}
                <strong className="text-cyan-300 font-mono-num">
                  {formatINR(totals.totalOpeningBalance)}
                </strong>
              </span>
              <span>
                {isHindi ? 'कुल बिल / पेमेंट:' : 'Bills / Payments:'}{' '}
                <strong className="text-white font-mono-num">
                  {totals.totalBillsCount} / {totals.totalPaymentsCount}
                </strong>
              </span>
            </div>
          </div>
        </section>

        {/* Search & Filter Controls */}
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="relative sm:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                isHindi
                  ? 'नाम, फ़ोन नंबर, पूरा पता या नोट खोजें...'
                  : 'Search name, phone, full address, or notes...'
              }
              aria-label={isHindi ? 'ग्राहक खोजें' : 'Search customer details'}
              className="w-full pl-10 pr-4 py-2.5 min-h-[44px] rounded-full bg-[#0D1A38] border border-blue-400/20 text-sm text-white placeholder:text-slate-400/60 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div className="flex items-center gap-1.5 p-1 rounded-full bg-[#0A142D] border border-blue-400/20 self-start overflow-x-auto max-w-full">
            {(
              [
                { id: 'all', labelHi: `सभी (${entries.length})`, labelEn: `All (${entries.length})` },
                {
                  id: 'due',
                  labelHi: `बाकी वाले (${totals.customersWithDues})`,
                  labelEn: `With Dues (${totals.customersWithDues})`,
                },
                {
                  id: 'settled',
                  labelHi: `हिसाब पूरा (${totals.settledCustomers})`,
                  labelEn: `Settled (${totals.settledCustomers})`,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                  filter === tab.id
                    ? isPro
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'bg-blue-600 text-white font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {isHindi ? tab.labelHi : tab.labelEn}
              </button>
            ))}
          </div>
        </div>

        {/* Direct WhatsApp chat fallback link if browser blocks background tab */}
        {whatsappFallbackLink ? (
          <div className="rounded-xl px-4 py-2.5 bg-emerald-500/10 border border-emerald-400/30 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-100">
            <span>
              {isHindi
                ? `${whatsappFallbackLink.customerName} के लिए WhatsApp रिमाइंडर तैयार है:`
                : `WhatsApp reminder ready for ${whatsappFallbackLink.customerName}:`}
            </span>
            <div className="flex items-center gap-2">
              <a
                href={whatsappFallbackLink.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>{isHindi ? 'WhatsApp खोलें' : 'Open WhatsApp'}</span>
              </a>
              <button
                type="button"
                onClick={() => setWhatsappFallbackLink(null)}
                aria-label="Close"
                className="px-2 py-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
              >
                ×
              </button>
            </div>
          </div>
        ) : null}

        {/* Individual Customer Detailed Cards */}
        {loading ? (
          <div className="glass-surface rounded-3xl p-6 text-sm text-slate-400">
            {t('app.loading')}
          </div>
        ) : filteredEntries.length === 0 ? (
          <EmptyState
            icon={Users}
            title={
              customers.length === 0
                ? isHindi
                  ? 'अभी कोई ग्राहक जुड़ा नहीं है'
                  : 'No customers added yet'
                : isHindi
                  ? 'खोज के अनुसार कोई ग्राहक नहीं मिला'
                  : 'No customers match your filter'
            }
            description={
              customers.length === 0
                ? isHindi
                  ? 'हर ग्राहक का नाम, फ़ोन नंबर, पूरा पता और बाकी हिसाब यहाँ अलग-अलग दिखेगा।'
                  : 'Every saved customer will appear here with full address, phone, notes, and balance breakdown.'
                : isHindi
                  ? 'दूसरा नाम, मोबाइल नंबर या पता लिखकर खोजें।'
                  : 'Try clearing the search query or changing the balance filter.'
            }
            actionLabel={customers.length === 0 ? t('dashboard.addCustomer') : undefined}
            onAction={customers.length === 0 ? () => navigate('/customers/add') : undefined}
          />
        ) : (
          <section
            aria-label={isHindi ? 'हर ग्राहक का अलग-अलग विवरण' : 'Individual Customer Details'}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {filteredEntries.map(
              ({
                customer: c,
                billCount,
                totalBilledAmount,
                lastBillDate,
                paymentCount,
                lastPaymentDate,
              }) => {
                const due = c.outstandingBalance || 0;
                const hasDue = due > 0;
                return (
                  <article
                    key={c.id}
                    className={`rounded-3xl p-5 space-y-4 border transition-all hover:-translate-y-0.5 ${
                      isPro
                        ? 'pro-card border-amber-400/30'
                        : 'glass-surface border-blue-400/20'
                    }`}
                  >
                    {/* Header: Name, Status & Remaining Balance */}
                    <div className="flex items-start justify-between gap-3 pb-3 border-b border-blue-400/15">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-bold text-white font-display break-words">
                            {c.name}
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide border ${
                              c.isActive !== false
                                ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
                                : 'bg-slate-700/60 border-slate-500/40 text-slate-300'
                            }`}
                          >
                            {c.isActive !== false
                              ? isHindi
                                ? 'सक्रिय'
                                : 'Active'
                              : isHindi
                                ? 'निष्क्रिय'
                                : 'Inactive'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-cyan-300 font-mono-num">
                          <Phone className="w-3.5 h-3.5 shrink-0" />
                          <a href={`tel:${c.mobileNumber}`} className="hover:underline">
                            {c.mobileNumber}
                          </a>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-[11px] text-slate-400">
                          {isHindi ? 'बाकी कितना है' : 'Remaining Due'}
                        </div>
                        <div
                          className={`text-lg font-bold font-mono-num tabular-nums ${
                            hasDue ? 'text-rose-300' : 'text-emerald-300'
                          }`}
                        >
                          {formatINR(due)}
                        </div>
                      </div>
                    </div>

                    {/* Full Address & Notes */}
                    <div className="space-y-2 text-xs">
                      <div className="flex items-start gap-2 text-slate-200">
                        <MapPin className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <span className="text-slate-400">
                            {isHindi ? 'पूरा पता: ' : 'Full Address: '}
                          </span>
                          <span className="break-words">
                            {c.address?.trim()
                              ? c.address.trim()
                              : isHindi
                                ? 'पता दर्ज नहीं किया गया'
                                : 'Address not added'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-start gap-2 text-slate-300">
                        <FileText className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <span className="text-slate-400">
                            {isHindi ? 'नोट्स / जानकारी: ' : 'Notes: '}
                          </span>
                          <span className="break-words">
                            {c.notes?.trim()
                              ? c.notes.trim()
                              : isHindi
                                ? 'कोई अतिरिक्त नोट नहीं'
                                : 'No extra notes'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 4-Metric Financial Breakdown */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-[#09132B] border border-blue-400/15 text-xs">
                      <div>
                        <div className="text-[10px] text-slate-400">
                          {isHindi ? 'कुल उधार' : 'Total Credit'}
                        </div>
                        <div className="font-mono-num font-semibold text-amber-300 mt-0.5">
                          {formatINR(c.totalCredit || 0)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400">
                          {isHindi ? 'कुल जमा' : 'Total Paid'}
                        </div>
                        <div className="font-mono-num font-semibold text-emerald-300 mt-0.5">
                          {formatINR(c.totalPaid || 0)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400">
                          {isHindi ? 'पिछला बकाया' : 'Opening Bal.'}
                        </div>
                        <div className="font-mono-num font-semibold text-slate-200 mt-0.5">
                          {formatINR(c.openingBalance || 0)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400">
                          {isHindi ? 'बिल / पेमेंट' : 'Bills / Pays'}
                        </div>
                        <div className="font-mono-num font-semibold text-cyan-300 mt-0.5">
                          {billCount} / {paymentCount}
                        </div>
                      </div>
                    </div>

                    {/* Dates & Activity Metadata */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>
                          {isHindi ? 'जुड़े:' : 'Added:'} {formatDateTime(c.createdAt)}
                        </span>
                      </span>
                      <span>
                        {lastBillDate
                          ? `${isHindi ? 'अंतिम बिल:' : 'Last Bill:'} ${formatDateTime(lastBillDate)} (${formatINR(totalBilledAmount)})`
                          : lastPaymentDate
                            ? `${isHindi ? 'अंतिम पेमेंट:' : 'Last Paid:'} ${formatDateTime(lastPaymentDate)}`
                            : `${isHindi ? 'अपडेट:' : 'Updated:'} ${formatDateTime(c.updatedAt)}`}
                      </span>
                    </div>

                    {/* Action Bar */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-blue-400/15">
                      <button
                        type="button"
                        onClick={() => navigate(`/customers/${c.id}`)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/35 border border-blue-400/30 text-cyan-200 text-xs font-medium"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>{isHindi ? 'पूरा खाता' : 'Full Khata'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => navigate(`/payments/take?customerId=${c.id}`)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-400/30 text-emerald-200 text-xs font-medium"
                      >
                        <ArrowDownLeft className="w-3.5 h-3.5" />
                        <span>{isHindi ? 'पेमेंट लें' : 'Take Payment'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleSendWhatsAppReminder(c)}
                        disabled={remindingCustomerId === c.id}
                        aria-label={`Send Reminder to ${c.name}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-medium ml-auto transition-colors whitespace-nowrap"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>
                          {remindingCustomerId === c.id ? 'Opening...' : 'Send Reminder'}
                        </span>
                      </button>
                    </div>
                  </article>
                );
              }
            )}
          </section>
        )}
      </div>
    </AppLayout>
  );
}
