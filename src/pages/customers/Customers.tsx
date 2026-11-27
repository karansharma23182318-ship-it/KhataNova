import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Crown, MessageCircle, Search, UserPlus, Users } from 'lucide-react';
import { AppLayout } from '../../components/layout/AppLayout';
import { EmptyState } from '../../components/common/EmptyState';
import { StatCard } from '../../components/common/StatCard';
import {
  canAddMoreCustomers,
  FREE_CUSTOMER_LIMIT,
} from '../../config/planConfig';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { listCustomers } from '../../services/customerService';
import { fetchDynamicCustomerReminderData } from '../../services/firebaseReminderData';
import { openWhatsAppTextLink } from '../../services/reportService';
import type { Customer } from '../../types/models';
import { formatINR } from '../../utils/finance';
import {
  buildCustomerWhatsAppReminderMessage,
  buildWhatsAppShareUrl,
} from '../../utils/share';

export function Customers() {
  const { language, t } = useLanguage();
  const { user, userProfile, hasPremierAccess, isProMode, toggleProMode, shopProfile } = useAuth();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [remindingCustomerId, setRemindingCustomerId] = useState<string | null>(null);
  const [whatsappFallbackLink, setWhatsappFallbackLink] = useState<{
    customerName: string;
    url: string;
  } | null>(null);
  const shopId = shopProfile?.id || user?.uid;
  const isHindi = language === 'hi';
  const isPro = isProMode;
  const canAddCustomer = canAddMoreCustomers(
    customers.length,
    userProfile?.subscriptionStatus,
    isProMode
  );

  useEffect(() => {
    if (!user || !shopId) {
      setCustomers([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listCustomers(shopId)
      .then((list) => {
        if (!cancelled) setCustomers(list);
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
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.mobileNumber.includes(q)
    );
  }, [customers, search]);

  const totalDue = useMemo(
    () => customers.reduce((sum, c) => sum + (c.outstandingBalance || 0), 0),
    [customers]
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
    <AppLayout title={t('nav.customers')}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label={t('dashboard.totalCustomers')} value={String(customers.length)} icon={Users} tone="blue" />
          <StatCard
            label={isHindi ? 'सक्रिय ग्राहक' : 'Active Customers'}
            value={String(customers.filter((c) => c.isActive).length)}
            icon={Users}
            tone="cyan"
          />
          <StatCard
            label={t('dashboard.totalOutstanding')}
            value={formatINR(totalDue)}
            icon={Users}
            tone="rose"
          />
        </div>

        {/* Plan Customer Limit Banner */}
        <div
          className={`rounded-3xl px-4 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs border ${
            isPro
              ? 'pro-card border-amber-400/35 text-amber-100'
              : !canAddCustomer
                ? 'bg-amber-500/10 border-amber-400/35 text-amber-100'
                : 'glass-surface border-blue-400/20 text-slate-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {isPro ? <Crown className="w-4 h-4 text-amber-300 shrink-0" /> : null}
            <span>
              {isPro
                ? isHindi
                  ? `असीमित ग्राहक अनलॉक हैं (${customers.length} जुड़े हुए · Pro Active)`
                  : `Unlimited customers unlocked (${customers.length} saved · Pro Active)`
                : !canAddCustomer
                  ? isHindi
                    ? `Free प्लान की 10 ग्राहकों की सीमा पूरी हो गई है (${customers.length}/${FREE_CUSTOMER_LIMIT}) — असीमित ग्राहक जोड़ने के लिए Pro लें।`
                    : `Free plan limit reached (${customers.length}/${FREE_CUSTOMER_LIMIT} customers) — upgrade to Pro for unlimited customers.`
                  : isHindi
                    ? `Free प्लान सीमा: ${customers.length} / ${FREE_CUSTOMER_LIMIT} ग्राहक जुड़े हैं (Pro में असीमित)`
                    : `Free Plan Limit: ${customers.length} / ${FREE_CUSTOMER_LIMIT} customers used (Unlimited in Pro)`}
            </span>
          </div>
          {!isPro ? (
            <button
              type="button"
              onClick={() => (hasPremierAccess ? void toggleProMode(true) : navigate('/premium/pay'))}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/35 text-amber-200 font-semibold whitespace-nowrap shrink-0"
            >
              <Crown className="w-3.5 h-3.5" />
              <span>
                {hasPremierAccess
                  ? isHindi
                    ? 'Pro ON करें (असीमित)'
                    : 'Turn Pro ON (Unlimited)'
                  : isHindi
                    ? 'Pro लें (₹199)'
                    : 'Upgrade Pro (₹199)'}
              </span>
            </button>
          ) : null}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="relative sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isHindi ? 'नाम या मोबाइल खोजें...' : 'Search name or mobile...'}
              className="w-full pl-10 pr-4 py-2.5 min-h-[44px] rounded-full bg-[#0D1A38] border border-blue-400/20 text-sm text-white focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => navigate('/customers/directory')}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-full bg-[#0D1A38] hover:bg-blue-600/20 border border-cyan-400/30 text-cyan-200 text-sm font-medium whitespace-nowrap shrink-0"
            >
              <ClipboardList className="w-4 h-4" />
              <span>{isHindi ? 'सभी का पूरा विवरण' : 'All Customer Info'}</span>
            </button>

            {canAddCustomer ? (
              <button
                type="button"
                onClick={() => navigate('/customers/add')}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-sm font-semibold whitespace-nowrap shrink-0 shadow-lg shadow-blue-950/40"
              >
                <UserPlus className="w-4 h-4" />
                <span>{t('dashboard.addCustomer')}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => (hasPremierAccess ? void toggleProMode(true) : navigate('/premium/pay'))}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-semibold whitespace-nowrap shrink-0"
              >
                <Crown className="w-4 h-4" />
                <span>
                  {hasPremierAccess
                    ? isHindi
                      ? 'Pro मोड ON करें'
                      : 'Turn Pro ON'
                    : isHindi
                      ? '10 सीमा पूरी · Pro लें'
                      : 'Limit Reached · Get Pro'}
                </span>
              </button>
            )}
          </div>
        </div>

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

        {loading ? (
          <div className="glass-surface rounded-3xl p-6 text-sm text-slate-400">
            {t('app.loading')}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title={isHindi ? 'अभी कोई ग्राहक नहीं जुड़ा है' : 'No customers added yet'}
            description={
              isHindi
                ? 'उधार और खरीदारी का डिजिटल खाता रखने के लिए अपने नियमित ग्राहक जोड़ें।'
                : 'Add your regular customers to track their udhaar, purchase history, and digital khata.'
            }
            actionLabel={
              canAddCustomer
                ? t('dashboard.addCustomer')
                : hasPremierAccess
                  ? isHindi
                    ? 'Pro मोड ON करें'
                    : 'Turn Pro ON'
                  : isHindi
                    ? 'Pro लें (₹199)'
                    : 'Upgrade to Pro'
            }
            onAction={() => {
              if (canAddCustomer) navigate('/customers/add');
              else if (hasPremierAccess) void toggleProMode(true);
              else navigate('/premium/pay');
            }}
          />
        ) : (
          <div className={`${isPro ? 'pro-card' : 'glass-surface'} rounded-3xl overflow-x-auto`}>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-blue-400/15 text-xs text-slate-400">
                <tr>
                  <th className="py-3 px-4 font-medium">{isHindi ? 'नाम' : 'Name'}</th>
                  <th className="py-3 px-4 font-medium">{isHindi ? 'मोबाइल' : 'Mobile'}</th>
                  <th className="py-3 px-4 font-medium text-right">{isHindi ? 'बकाया' : 'Outstanding'}</th>
                  <th className="py-3 px-4 font-medium text-right">WhatsApp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-400/10">
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/customers/${c.id}`)}
                    className="hover:bg-white/5 cursor-pointer"
                  >
                    <td className="py-3 px-4 font-medium text-white">{c.name}</td>
                    <td className="py-3 px-4 font-mono-num text-slate-300">{c.mobileNumber}</td>
                    <td className="py-3 px-4 text-right font-mono-num font-semibold text-amber-300">
                      {formatINR(c.outstandingBalance || 0)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleSendWhatsAppReminder(c);
                        }}
                        disabled={remindingCustomerId === c.id}
                        aria-label={`Send Reminder to ${c.name}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-medium transition-colors whitespace-nowrap"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>
                          {remindingCustomerId === c.id ? 'Opening...' : 'Send Reminder'}
                        </span>
                      </button>
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
