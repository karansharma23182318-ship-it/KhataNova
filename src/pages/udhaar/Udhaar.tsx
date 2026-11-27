import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownLeft, BellRing, BookOpenCheck, MessageCircle } from 'lucide-react';
import { AppLayout } from '../../components/layout/AppLayout';
import { EmptyState } from '../../components/common/EmptyState';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { listCustomers } from '../../services/customerService';
import { openWhatsAppTextLink } from '../../services/reportService';
import type { Customer } from '../../types/models';
import { formatINR } from '../../utils/finance';
import { buildWhatsAppShareUrl } from '../../utils/share';

export function Udhaar() {
  const { language, t } = useLanguage();
  const { user, isProMode, shopProfile } = useAuth();
  const { settings, evaluations } = useNotifications();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const shopId = shopProfile?.id || user?.uid;
  const shopName = shopProfile?.shopName || 'KhataNova';
  const isHindi = language === 'hi';
  const isPro = isProMode;
  const overdueCount = evaluations.filter((e) => e.outstandingBalance > 0 && e.cycleNumber >= 1).length;

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
        if (!cancelled) setCustomers(list.filter((c) => (c.outstandingBalance || 0) > 0));
      })
      .catch(console.warn)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, shopId]);

  const handleSendDueWhatsApp = (c: Customer) => {
    const msg = isHindi
      ? `*${shopName}* — उधार याद दिलाने का संदेश\nग्राहक: ${c.name}\nबाकी उधार राशि: *${formatINR(c.outstandingBalance)}*\nकृपया बकाया राशि जमा करें। धन्यवाद! 🙏`
      : `*${shopName}* — Payment Reminder\nCustomer: ${c.name}\nBalance Due: *${formatINR(c.outstandingBalance)}*\nPlease settle your balance at your convenience. Thank you! 🙏`;
    openWhatsAppTextLink(buildWhatsAppShareUrl(msg, c.mobileNumber));
  };

  return (
    <AppLayout title={t('nav.udhaar')}>
      <div className="space-y-6">
        <div
          className={`${isPro ? 'pro-card' : 'glass-surface'} rounded-3xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3`}
        >
          <div className="flex items-center gap-3 text-xs">
            <BellRing className="w-4 h-4 text-cyan-300 shrink-0" />
            <span className="text-slate-200">
              {settings.enabled
                ? isHindi
                  ? `ऑटो दुकानदार रिमाइंडर चालू (${settings.intervalDays} दिन अंतराल) · ${overdueCount} ग्राहक देय`
                  : `Auto shopkeeper reminders ON (${settings.intervalDays}-day interval) · ${overdueCount} due`
                : isHindi
                  ? 'ऑटो दुकानदार रिमाइंडर बंद है'
                  : 'Auto shopkeeper reminders paused'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/notifications')}
            className="text-xs font-semibold text-cyan-300 hover:underline"
          >
            {isHindi ? 'रिमाइंडर व इतिहास खोलें →' : 'Open Reminders & Settings →'}
          </button>
        </div>
        {loading ? (
          <div className="glass-surface rounded-3xl p-6 text-sm text-slate-400">
            {t('app.loading')}
          </div>
        ) : customers.length === 0 ? (
          <EmptyState
            icon={BookOpenCheck}
            title={isHindi ? 'कोई बकाया उधार नहीं है' : 'No pending Udhaar balances'}
            description={
              isHindi
                ? 'जब आप किसी ग्राहक को उधार (Credit) बिक्री करेंगे, तो उसका बकाया यहाँ दिखेगा।'
                : 'When you record a Credit / Udhaar sale, customer dues and running balances appear automatically here.'
            }
            actionLabel={t('dashboard.newSale')}
            onAction={() => navigate('/sales/new')}
          />
        ) : (
          <div className={`${isPro ? 'pro-card' : 'glass-surface'} rounded-3xl overflow-x-auto`}>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-blue-400/15 text-xs text-slate-400">
                <tr>
                  <th className="py-3 px-4 font-medium">{isHindi ? 'ग्राहक' : 'Customer'}</th>
                  <th className="py-3 px-4 font-medium">{isHindi ? 'मोबाइल' : 'Mobile'}</th>
                  <th className="py-3 px-4 font-medium text-right">{isHindi ? 'बकाया राशि' : 'Due Amount'}</th>
                  <th className="py-3 px-4 font-medium text-right">{isHindi ? 'कार्रवाई' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-400/10">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-white/5">
                    <td className="py-3 px-4 font-medium text-white">{c.name}</td>
                    <td className="py-3 px-4 font-mono-num text-slate-300">{c.mobileNumber}</td>
                    <td className="py-3 px-4 text-right font-mono-num font-semibold text-rose-300">
                      {formatINR(c.outstandingBalance)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleSendDueWhatsApp(c)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-400/30 text-emerald-200 text-xs font-medium"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>WhatsApp</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/payments/take?customerId=${c.id}`)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/35 border border-blue-400/30 text-cyan-200 text-xs font-medium"
                        >
                          <ArrowDownLeft className="w-3.5 h-3.5" />
                          <span>{isHindi ? 'जमा लें' : 'Pay'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/customers/${c.id}`)}
                          className="text-xs font-medium text-cyan-300 hover:underline px-1"
                        >
                          {isHindi ? 'खाता' : 'Khata'}
                        </button>
                      </div>
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
