import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownLeft, MessageCircle, Wallet } from 'lucide-react';
import { AppLayout } from '../../components/layout/AppLayout';
import { EmptyState } from '../../components/common/EmptyState';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { listCustomers } from '../../services/customerService';
import { listPayments } from '../../services/paymentService';
import { openWhatsAppTextLink } from '../../services/reportService';
import type { Customer, PaymentRecord } from '../../types/models';
import { formatINR } from '../../utils/finance';
import { buildPaymentWhatsAppMessage, buildWhatsAppShareUrl } from '../../utils/share';

export function Payments() {
  const { language, t } = useLanguage();
  const { user, isProMode, shopProfile } = useAuth();
  const navigate = useNavigate();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const shopId = shopProfile?.id || user?.uid;
  const shopName = shopProfile?.shopName || 'KhataNova';
  const isHindi = language === 'hi';
  const isPro = isProMode;

  useEffect(() => {
    if (!user || !shopId) {
      setPayments([]);
      setCustomers([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([listPayments(shopId), listCustomers(shopId)])
      .then(([pList, cList]) => {
        if (!cancelled) {
          setPayments(pList);
          setCustomers(cList);
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

  const customerMap = useMemo(() => {
    const map = new Map<string, Customer>();
    for (const c of customers) {
      map.set(c.id, c);
    }
    return map;
  }, [customers]);

  const handleSendPaymentWhatsApp = (p: PaymentRecord) => {
    const cust = p.customerId ? customerMap.get(p.customerId) : undefined;
    const msg = buildPaymentWhatsAppMessage({
      shopName,
      shopPhone: shopProfile?.phoneNumber,
      customerName: p.customerName || cust?.name || (isHindi ? 'ग्राहक' : 'Customer'),
      customerPhone: cust?.mobileNumber,
      receiptId: p.receiptId,
      amountPaid: p.amount,
      paymentMethod: p.paymentMethod,
      paymentDate: p.paymentDate || p.createdAt,
      remainingBalance: cust?.outstandingBalance,
      notes: p.notes,
      language,
    });
    const url = buildWhatsAppShareUrl(msg, cust?.mobileNumber);
    openWhatsAppTextLink(url);
  };

  return (
    <AppLayout title={t('nav.payments')}>
      <div className="space-y-6">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => navigate('/payments/take')}
            className="inline-flex items-center gap-2 px-6 py-2.5 min-h-[44px] rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold whitespace-nowrap shrink-0 shadow-lg shadow-emerald-950/35"
          >
            <ArrowDownLeft className="w-4 h-4" />
            <span>{t('dashboard.takePayment')}</span>
          </button>
        </div>

        {loading ? (
          <div className="glass-surface rounded-3xl p-6 text-sm text-slate-400">
            {t('app.loading')}
          </div>
        ) : payments.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title={isHindi ? 'अभी तक कोई पेमेंट जमा नहीं हुआ है' : 'No payments collected yet'}
            description={
              isHindi
                ? 'उधार जमा या नकद/UPI पेमेंट रिकॉर्ड करें और ग्राहक को WhatsApp पर रसीद भेजें।'
                : 'Record customer payments in Cash or UPI to settle Udhaar balances and send WhatsApp receipts.'
            }
            actionLabel={t('dashboard.takePayment')}
            onAction={() => navigate('/payments/take')}
          />
        ) : (
          <div className={`${isPro ? 'pro-card' : 'glass-surface'} rounded-3xl overflow-x-auto`}>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-blue-400/15 text-xs text-slate-400">
                <tr>
                  <th className="py-3 px-4 font-medium">{isHindi ? 'रसीद नं' : 'Receipt'}</th>
                  <th className="py-3 px-4 font-medium">{isHindi ? 'ग्राहक' : 'Customer'}</th>
                  <th className="py-3 px-4 font-medium">{isHindi ? 'माध्यम' : 'Method'}</th>
                  <th className="py-3 px-4 font-medium text-right">{isHindi ? 'राशि' : 'Amount'}</th>
                  <th className="py-3 px-4 font-medium text-right">WhatsApp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-400/10">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="py-3 px-4 font-mono-num text-cyan-300">{p.receiptId}</td>
                    <td className="py-3 px-4 text-slate-200">{p.customerName || 'Walk-in'}</td>
                    <td className="py-3 px-4 uppercase text-xs text-slate-300">{p.paymentMethod}</td>
                    <td className="py-3 px-4 text-right font-mono-num font-semibold text-emerald-300">
                      {formatINR(p.amount)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleSendPaymentWhatsApp(p)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-400/35 text-emerald-200 text-xs font-medium whitespace-nowrap"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>{isHindi ? 'रसीद भेजें' : 'Send'}</span>
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
