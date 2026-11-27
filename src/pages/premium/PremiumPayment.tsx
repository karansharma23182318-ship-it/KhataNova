import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock, QrCode, XCircle } from 'lucide-react';
import { AppLayout } from '../../components/layout/AppLayout';
import { ProModeSwitch } from '../../components/common/ProModeSwitch';
import { DEFAULT_PAYMENT_INSTRUCTIONS, PLAN_CONFIG } from '../../config/planConfig';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import {
  getActiveAdminPaymentSettings,
  getActiveSiteSettings,
  getUserPremiumRequests,
  submitPremiumPaymentRequest,
} from '../../services/premiumService';
import type { AdminPaymentSettings, PremiumPaymentRequest } from '../../types/models';
import { formatINR, getLocalDateKey } from '../../utils/finance';

export function PremiumPayment() {
  const { language } = useLanguage();
  const {
    user,
    userProfile,
    hasPremierAccess,
    shopProfile,
    authReady,
    authLoading,
    loginWithGoogle,
    refreshProfile,
  } = useAuth();
  const [settings, setSettings] = useState<AdminPaymentSettings | null>(null);
  const [priceInr, setPriceInr] = useState<number>(PLAN_CONFIG.premium.priceInr);
  const [myRequests, setMyRequests] = useState<PremiumPaymentRequest[]>([]);
  const [loadNotice, setLoadNotice] = useState<string | null>(null);
  const [utrNumber, setUtrNumber] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => getLocalDateKey());
  const [submittedUtr, setSubmittedUtr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isHindi = language === 'hi';

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;

    getActiveAdminPaymentSettings()
      .then((res) => {
        if (cancelled) return;
        setSettings(res.settings);
        setLoadNotice(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadNotice(err instanceof Error ? err.message : 'Unable to load payment settings.');
        }
      });

    getActiveSiteSettings()
      .then((site) => {
        if (!cancelled && site?.premiumPriceInr) {
          setPriceInr(site.premiumPriceInr);
        }
      })
      .catch(() => {});

    if (user) {
      getUserPremiumRequests(user.uid)
        .then((reqs) => {
          if (!cancelled) setMyRequests(reqs);
        })
        .catch(() => {
          // Ignore non-fatal history load error
        });
    } else {
      setMyRequests([]);
    }

    return () => {
      cancelled = true;
    };
  }, [authReady, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError(
        isHindi
          ? 'UTR अनुरोध सबमिट करने के लिए कृपया ऊपर "Google के साथ जारी रखें" पर क्लिक करके लॉगिन करें।'
          : 'Please sign in with Google first before submitting your UTR.'
      );
      return;
    }
    const cleanUtr = utrNumber.trim();
    if (cleanUtr.length < 4) {
      setError(
        isHindi
          ? 'कृपया सही UTR / ट्रांज़ैक्शन रेफ़रेंस नंबर दर्ज करें (कम से कम 4 अक्षर/अंक)।'
          : 'Enter a valid UTR / transaction reference number (at least 4 characters).'
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await submitPremiumPaymentRequest({
        uid: user.uid,
        shopId: shopProfile?.id || user.uid,
        shopkeeperName: userProfile?.displayName || user.displayName || 'Shopkeeper',
        shopName: shopProfile?.shopName || 'My Shop',
        phoneNumber: shopProfile?.phoneNumber || '',
        email: user.email || '',
        amount: priceInr,
        utrNumber: cleanUtr,
        paymentDate,
      });
      setSubmittedUtr(cleanUtr);
      setUtrNumber('');
      const updatedReqs = await getUserPremiumRequests(user.uid).catch(() => []);
      setMyRequests(updatedReqs);
      await refreshProfile().catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppLayout title={isHindi ? 'प्रीमियम QR पेमेंट' : 'Premium QR Payment'}>
      <div className="max-w-2xl space-y-6">
        {!user ? (
          <div className="glass-surface-elevated rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-amber-400/30">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-amber-200">
                {isHindi
                  ? 'UTR सबमिट करने के लिए Google लॉगिन ज़रूरी है'
                  : 'Google Sign-In required to submit UTR'}
              </h2>
              <p className="text-xs text-slate-300">
                {isHindi
                  ? 'पहले अपने Google खाते से साइन इन करें ताकि आपका UTR एडमिन पैनल में आपके नाम व दुकान के साथ दिखाई दे।'
                  : 'Sign in with Google so your UTR number links to your shop and shows up in the Admin Panel.'}
              </p>
            </div>
            <button
              type="button"
              disabled={authLoading}
              onClick={() => void loginWithGoogle()}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-semibold whitespace-nowrap shrink-0"
            >
              {authLoading
                ? isHindi
                  ? 'लॉगिन हो रहा है...'
                  : 'Signing in...'
                : isHindi
                  ? 'Google के साथ जारी रखें'
                  : 'Continue with Google'}
            </button>
          </div>
        ) : null}

        {hasPremierAccess ? (
          <ProModeSwitch variant="card" />
        ) : null}

        <div className="glass-surface rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">
              Lifetime Premium · {formatINR(priceInr)}
            </h2>
          </div>

          {settings?.qrImageUrl || settings?.upiId ? (
            <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-white text-slate-900">
              {settings.qrImageUrl ? (
                <img
                  src={settings.qrImageUrl}
                  alt="Admin Active UPI QR Code"
                  className="w-52 h-52 object-contain"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <QrCode className="w-14 h-14 text-slate-700" />
              )}
              {settings.upiId ? (
                <div className="text-xs font-mono-num font-semibold">UPI ID: {settings.upiId}</div>
              ) : null}
            </div>
          ) : (
            <div className="p-6 rounded-xl bg-[#0A142D] border border-blue-400/15 text-center space-y-2">
              <QrCode className="w-10 h-10 text-cyan-400 mx-auto" />
              <p className="text-xs text-slate-400">
                {loadNotice ||
                  (isHindi
                    ? 'एडमिन पैनल में अभी QR कोड सेट नहीं किया गया है, लेकिन आप भुगतान के बाद अपना UTR नंबर नीचे सबमिट कर सकते हैं।'
                    : 'Active UPI QR Code has not been configured by the Owner Admin Panel yet.')}
              </p>
            </div>
          )}

          <p className="text-xs text-slate-300 leading-relaxed">
            {settings?.instructions ||
              (language === 'hi'
                ? DEFAULT_PAYMENT_INSTRUCTIONS.hi
                : DEFAULT_PAYMENT_INSTRUCTIONS.en)}
          </p>
        </div>

        {submittedUtr ? (
          <div className="glass-surface-elevated rounded-2xl p-6 space-y-3 border border-emerald-500/35">
            <div className="flex items-center gap-2 text-emerald-300 font-semibold text-base">
              <CheckCircle2 className="w-5 h-5" />
              <span>
                {isHindi
                  ? 'UTR पेमेंट अनुरोध सबमिट हो गया!'
                  : 'Payment Request Submitted (Pending Verification)'}
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {isHindi
                ? `आपका UTR नंबर (${submittedUtr}) एडमिन पैनल में भेज दिया गया है। एडमिन द्वारा सत्यापित होते ही आपका प्रीमियम प्लान सक्रिय हो जाएगा।`
                : `Your UTR reference (${submittedUtr}) has been sent to the Admin Panel. Premium will activate automatically once approved.`}
            </p>
            <button
              type="button"
              onClick={() => setSubmittedUtr(null)}
              className="text-xs text-cyan-300 hover:text-cyan-200 underline"
            >
              {isHindi ? 'एक और UTR सबमिट करें' : 'Submit another UTR'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="glass-surface rounded-2xl p-6 space-y-4">
            {error ? (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs leading-relaxed">
                {error}
              </div>
            ) : null}
            <div>
              <label htmlFor="premium-utr" className="block text-xs text-slate-300 mb-1.5">
                {isHindi ? 'UTR / रेफ़रेंस नंबर *' : 'UTR / Reference Number *'}
              </label>
              <input
                id="premium-utr"
                value={utrNumber}
                onChange={(e) => setUtrNumber(e.target.value)}
                required
                placeholder="e.g. 432198765432"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white placeholder:text-slate-400/55 font-mono-num focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label htmlFor="premium-date" className="block text-xs text-slate-300 mb-1.5">
                {isHindi ? 'भुगतान की तारीख *' : 'Payment Date *'}
              </label>
              <input
                id="premium-date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white font-mono-num focus:outline-none focus:border-cyan-400"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
            >
              {submitting
                ? isHindi
                  ? 'सबमिट हो रहा है...'
                  : 'Submitting...'
                : isHindi
                  ? 'पेमेंट अनुरोध सबमिट करें'
                  : 'Submit Payment Request'}
            </button>
          </form>
        )}

        {myRequests.length > 0 ? (
          <div className="glass-surface rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white">
              {isHindi ? 'आपके सबमिट किए गए UTR अनुरोध' : 'Your Submitted UTR Requests'}
            </h3>
            <div className="space-y-2">
              {myRequests.map((req) => (
                <div
                  key={req.id}
                  className="p-3 rounded-xl bg-[#0A142D] border border-blue-400/15 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="font-mono-num font-semibold text-cyan-300 truncate">
                      UTR: {req.utrNumber}
                    </div>
                    <div className="text-slate-400">
                      {formatINR(req.amount)} · {req.paymentDate}
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold uppercase shrink-0 ${
                      req.status === 'approved'
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/30'
                        : req.status === 'rejected'
                          ? 'bg-rose-500/15 text-rose-300 border border-rose-400/30'
                          : 'bg-amber-500/15 text-amber-300 border border-amber-400/30'
                    }`}
                  >
                    {req.status === 'approved' ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : req.status === 'rejected' ? (
                      <XCircle className="w-3.5 h-3.5" />
                    ) : (
                      <Clock className="w-3.5 h-3.5" />
                    )}
                    <span>{req.status}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </AppLayout>
  );
}
