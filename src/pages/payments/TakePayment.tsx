import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, CheckCircle2, Copy, MessageCircle } from 'lucide-react';
import { AppLayout } from '../../components/layout/AppLayout';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { listCustomers } from '../../services/customerService';
import { recordCustomerPayment } from '../../services/paymentService';
import { openWhatsAppTextLink } from '../../services/reportService';
import type { Customer } from '../../types/models';
import { formatINR, getLocalDateKey, toLocalIsoTimestamp } from '../../utils/finance';
import { buildPaymentWhatsAppMessage, buildWhatsAppShareUrl } from '../../utils/share';

interface SavedPaymentReceipt {
  receiptId: string;
  customerName: string;
  customerPhone: string;
  amountPaid: number;
  paymentMethod: 'cash' | 'upi' | 'other';
  paymentDate: string;
  remainingBalance: number;
  notes?: string;
}

export function TakePayment() {
  const { user, isProMode, shopProfile } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const shopId = shopProfile?.id || user?.uid;
  const shopName = shopProfile?.shopName || 'KhataNova';
  const isHindi = language === 'hi';
  const isPro = isProMode;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState(() => searchParams.get('customerId') || '');
  const [amountText, setAmountText] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'other'>('cash');
  const [paymentDate, setPaymentDate] = useState(() => getLocalDateKey());
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedReceipt, setSavedReceipt] = useState<SavedPaymentReceipt | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user || !shopId) return;
    listCustomers(shopId).then(setCustomers).catch(console.warn);
  }, [user, shopId]);

  const selectedCustomer = customers.find((c) => c.id === customerId);

  const whatsappReceipt = useMemo(() => {
    if (!savedReceipt) return null;
    const message = buildPaymentWhatsAppMessage({
      shopName,
      shopPhone: shopProfile?.phoneNumber,
      customerName: savedReceipt.customerName,
      customerPhone: savedReceipt.customerPhone,
      receiptId: savedReceipt.receiptId,
      amountPaid: savedReceipt.amountPaid,
      paymentMethod: savedReceipt.paymentMethod,
      paymentDate: savedReceipt.paymentDate,
      remainingBalance: savedReceipt.remainingBalance,
      notes: savedReceipt.notes,
      language,
    });
    return {
      message,
      url: buildWhatsAppShareUrl(message, savedReceipt.customerPhone),
    };
  }, [savedReceipt, shopName, shopProfile?.phoneNumber, language]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !shopId) {
      setError(isHindi ? 'कृपया पहले Google से साइन इन करें।' : 'Please sign in first.');
      return;
    }
    if (!customerId || !selectedCustomer) {
      setError(isHindi ? 'कृपया ग्राहक चुनें।' : 'Please select a customer.');
      return;
    }
    const numericAmount = Number(amountText) || 0;
    if (numericAmount <= 0) {
      setError(isHindi ? 'सही जमा राशि दर्ज करें।' : 'Enter a valid payment amount.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const paymentIso = toLocalIsoTimestamp(paymentDate);
      const result = await recordCustomerPayment(shopId, user.uid, {
        customerId,
        amount: numericAmount,
        paymentMethod,
        paymentDate: paymentIso,
        notes,
      });

      const nextBalance =
        typeof result.remainingBalance === 'number'
          ? result.remainingBalance
          : Math.max(0, (selectedCustomer.outstandingBalance || 0) - numericAmount);

      setSavedReceipt({
        receiptId: result.receiptId,
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.mobileNumber || '',
        amountPaid: numericAmount,
        paymentMethod,
        paymentDate: paymentIso,
        remainingBalance: nextBalance,
        notes: notes.trim() || undefined,
      });

      setCustomers((prev) =>
        prev.map((c) =>
          c.id === selectedCustomer.id ? { ...c, outstandingBalance: nextBalance } : c
        )
      );
      setAmountText('');
      setNotes('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyMessage = async () => {
    if (!whatsappReceipt) return;
    try {
      await navigator.clipboard.writeText(whatsappReceipt.message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <AppLayout title={isHindi ? 'पेमेंट जमा करें' : 'Take Payment'}>
      <div className="max-w-xl space-y-5">
        {savedReceipt && whatsappReceipt ? (
          <div
            className={`${isPro ? 'pro-card border-amber-400/35' : 'glass-surface border-emerald-400/35'} rounded-2xl p-6 space-y-4`}
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-bold text-white font-display">
                  {isHindi ? 'उधार पेमेंट जमा हो गया!' : 'Udhaar Payment Recorded!'}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5 font-mono-num">
                  {isHindi ? 'रसीद नं:' : 'Receipt:'} {savedReceipt.receiptId}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-[#0A142D] border border-blue-400/20 p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">{isHindi ? 'ग्राहक' : 'Customer'}</span>
                <span className="text-white font-semibold">{savedReceipt.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">{isHindi ? 'जमा राशि' : 'Amount Paid'}</span>
                <span className="font-mono-num font-bold text-emerald-300">
                  {formatINR(savedReceipt.amountPaid)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">{isHindi ? 'बाकी उधार' : 'Remaining Due'}</span>
                <span className="font-mono-num font-semibold text-amber-300">
                  {formatINR(savedReceipt.remainingBalance)}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => openWhatsAppTextLink(whatsappReceipt.url)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
              >
                <MessageCircle className="w-4 h-4" />
                <span>
                  {isHindi ? 'WhatsApp पर रसीद भेजें' : 'Send Receipt on WhatsApp'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => void handleCopyMessage()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-100 text-xs font-medium"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? (isHindi ? 'कॉपी हो गया' : 'Copied') : isHindi ? 'मैसेज कॉपी करें' : 'Copy Message'}</span>
              </button>

              <button
                type="button"
                onClick={() => navigate('/payments')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-blue-400/25 text-cyan-200 hover:bg-blue-500/10 text-xs font-medium"
              >
                {isHindi ? 'पेमेंट सूची देखें' : 'All Payments'}
              </button>

              <button
                type="button"
                onClick={() => setSavedReceipt(null)}
                className="text-xs text-slate-400 hover:text-white px-2 py-1"
              >
                {isHindi ? '+ और पेमेंट लें' : '+ Record Another'}
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className={`${isPro ? 'pro-card' : 'glass-surface'} rounded-2xl p-6 space-y-4`}
          >
            {error ? (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs">
                {error}
              </div>
            ) : null}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                {isHindi ? 'ग्राहक चुनें *' : 'Customer *'}
              </label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white"
              >
                <option value="">{isHindi ? 'ग्राहक चुनें' : 'Select Customer'}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({isHindi ? 'बकाया' : 'Due'}: {formatINR(c.outstandingBalance || 0)})
                  </option>
                ))}
              </select>
            </div>

            {selectedCustomer ? (
              <div className="text-xs text-slate-300">
                {isHindi ? 'वर्तमान उधार बकाया:' : 'Current Outstanding:'}{' '}
                <span className="font-mono-num font-semibold text-amber-300">
                  {formatINR(selectedCustomer.outstandingBalance || 0)}
                </span>
              </div>
            ) : null}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                {isHindi ? 'जमा राशि (₹) *' : 'Amount (₹) *'}
              </label>
              <input
                type="number"
                min="1"
                step="0.01"
                placeholder="0"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white placeholder:text-slate-400/55 font-mono-num"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  {isHindi ? 'भुगतान माध्यम' : 'Payment Method'}
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as 'cash' | 'upi' | 'other')}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white"
                >
                  <option value="cash">{isHindi ? 'नकद (Cash)' : 'Cash'}</option>
                  <option value="upi">UPI</option>
                  <option value="other">{isHindi ? 'अन्य' : 'Other'}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  {isHindi ? 'तारीख' : 'Date'}
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white font-mono-num"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                {isHindi ? 'नोट्स (वैकल्पिक)' : 'Notes'}
              </label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={isHindi ? 'जैसे: आधा उधार जमा' : 'Optional note...'}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white placeholder:text-slate-400/55"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => navigate('/payments')}
                className="px-4 py-2.5 rounded-xl border border-blue-400/20 text-sm text-slate-300"
              >
                {isHindi ? 'रद्द करें' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold"
              >
                {saving
                  ? isHindi
                    ? 'सेव हो रहा है...'
                    : 'Recording...'
                  : isHindi
                    ? 'पेमेंट जमा करें'
                    : 'Record Payment'}
              </button>
            </div>
          </form>
        )}
      </div>
    </AppLayout>
  );
}
