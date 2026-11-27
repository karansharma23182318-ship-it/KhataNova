import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Copy,
  Crown,
  Download,
  Lock,
  MessageCircle,
  QrCode,
  X,
} from 'lucide-react';
import { AppLayout } from '../../components/layout/AppLayout';
import { ProModeSwitch } from '../../components/common/ProModeSwitch';
import { UpiPaymentQrModal } from '../../components/sales/UpiPaymentQrModal';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { getCustomerById } from '../../services/customerService';
import { getSaleById } from '../../services/salesService';
import type { Sale } from '../../types/models';
import { formatINR, formatSaleItemQuantity } from '../../utils/finance';
import { buildSaleWhatsAppMessage, buildWhatsAppShareUrl } from '../../utils/share';
import { hasShopPaymentScannerConfigured } from '../../utils/upiScanner';
import {
  downloadSaleInvoicePdf,
  shareSaleOnWhatsApp,
} from '../../services/reportService';

export function SaleDetails() {
  const { id } = useParams<{ id: string }>();
  const { user, hasPremierAccess, isProMode, toggleProMode, shopProfile } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [sale, setSale] = useState<Sale | null>(null);
  const [customerPhone, setCustomerPhone] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPaymentScanner, setShowPaymentScanner] = useState(false);
  const [showProScannerGate, setShowProScannerGate] = useState(false);
  const [shareHint, setShareHint] = useState<string | null>(null);
  const shopId = shopProfile?.id || user?.uid;
  const shopName = shopProfile?.shopName || 'KhataNova';
  const isHindi = language === 'hi';
  const isPro = isProMode;

  useEffect(() => {
    if (!user || !shopId || !id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getSaleById(id)
      .then((found) => {
        if (cancelled) return;
        setSale(found);
        if (found?.customerPhone) {
          setCustomerPhone(found.customerPhone);
        } else if (found?.customerId) {
          getCustomerById(found.customerId)
            .then((cust) => {
              if (!cancelled && cust?.mobileNumber) {
                setCustomerPhone(cust.mobileNumber);
              }
            })
            .catch(() => {
              // Optional customer phone lookup
            });
        }
      })
      .catch(console.warn)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, shopId, id]);

  const resolvedPhone = customerPhone || sale?.customerPhone;

  const whatsappPreview = useMemo(() => {
    if (!sale) return null;
    const message = buildSaleWhatsAppMessage(shopName, sale, language, {
      phoneNumber: shopProfile?.phoneNumber,
      address: shopProfile?.address,
    });
    return {
      message,
      url: buildWhatsAppShareUrl(message, resolvedPhone),
    };
  }, [sale, shopName, language, resolvedPhone, shopProfile?.phoneNumber, shopProfile?.address]);

  const handleDownloadPdf = () => {
    if (!sale) return;
    if (!isPro) {
      setShareHint(
        isHindi
          ? 'PDF बिल डाउनलोड केवल Pro (₹199 Lifetime) प्लान में उपलब्ध है। Free में आप लिखित रसीद WhatsApp पर भेज सकते हैं।'
          : 'PDF Invoice generation is exclusively for Pro (₹199 Lifetime) users. On Free plan, share the written receipt via WhatsApp.'
      );
      return;
    }
    downloadSaleInvoicePdf(shopProfile || shopName, sale, resolvedPhone);
    setShareHint(
      isHindi
        ? `${sale.invoiceId}.pdf (मॉल-स्टाइल Pro PDF) डाउनलोड हो गया।`
        : `${sale.invoiceId}.pdf (Pro Mall Receipt) downloaded.`
    );
  };

  const handleWhatsAppShare = async () => {
    if (!sale) return;
    setSharing(true);
    setShareHint(null);
    try {
      await shareSaleOnWhatsApp({
        shopProfile,
        shopName,
        sale,
        language,
        customerPhone: resolvedPhone,
      });
      setShareHint(
        isHindi
          ? 'WhatsApp पर लिखित बिल (Text Format) खुल रहा है। यदि न खुले तो नीचे "WhatsApp में खोलें" या "बिल कॉपी करें" दबाएं।'
          : 'Opening WhatsApp with written text bill. If blocked, tap "Open WhatsApp" or "Copy Bill" below.'
      );
    } finally {
      setSharing(false);
    }
  };

  const handleCopyBill = async () => {
    if (!whatsappPreview) return;
    try {
      await navigator.clipboard.writeText(whatsappPreview.message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setShareHint(
        isHindi
          ? 'टेक्स्ट कॉपी नहीं हो सका।'
          : 'Could not copy bill text automatically.'
      );
    }
  };

  const paymentStatusLabel = sale
    ? sale.dueAmount <= 0
      ? isHindi
        ? 'भुगतान पूर्ण (PAID)'
        : 'PAID'
      : sale.paidAmount > 0
        ? isHindi
          ? 'आंशिक भुगतान (PARTIAL)'
          : 'PARTIAL'
        : isHindi
          ? 'उधार बकाया (DUE)'
          : 'UDHAAR DUE'
    : '';

  return (
    <AppLayout title={sale ? `${isHindi ? 'बिल' : 'Invoice'} ${sale.invoiceId}` : isHindi ? 'बिक्री विवरण' : 'Sale Details'}>
      <div className="max-w-3xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/sales')}
            className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{isHindi ? 'बिक्री सूची' : 'Back to Sales'}</span>
          </button>
          {sale ? (
            <div className="flex flex-wrap items-center gap-2.5">
              {isPro ? (
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>{isHindi ? 'Pro PDF डाउनलोड' : 'Download Pro PDF'}</span>
                </button>
              ) : hasPremierAccess ? (
                <button
                  type="button"
                  onClick={() => void toggleProMode(true)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/45 text-amber-200 text-xs font-semibold transition-colors"
                >
                  <Crown className="w-3.5 h-3.5 text-amber-300" />
                  <span>{isHindi ? 'Pro ON करें (PDF अनलॉक)' : 'Turn Pro ON (PDF)'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate('/premium/pay')}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/35 text-amber-200 text-xs font-semibold transition-colors"
                >
                  <Lock className="w-3.5 h-3.5 text-amber-300" />
                  <span>{isHindi ? 'PDF (केवल Pro · ₹199)' : 'PDF (Pro Only · ₹199)'}</span>
                </button>
              )}
              <button
                type="button"
                disabled={sharing}
                onClick={() => void handleWhatsAppShare()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-semibold transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                <span>
                  {sharing
                    ? isHindi
                      ? 'खुल रहा है...'
                      : 'Opening...'
                    : isHindi
                      ? 'WhatsApp लिखित बिल'
                      : 'WhatsApp Text Bill'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!isPro) {
                    setShowProScannerGate((prev) => !prev);
                    return;
                  }
                  if (!hasShopPaymentScannerConfigured(shopProfile)) {
                    navigate(
                      `/profile?setupScanner=1&returnTo=${encodeURIComponent(`/sales/${sale.id}`)}#payment-scanner`
                    );
                    return;
                  }
                  setShowPaymentScanner(true);
                }}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                  isPro
                    ? 'border-violet-400/45 bg-violet-600/25 hover:bg-violet-600/35 text-violet-100'
                    : 'border-amber-400/35 bg-amber-500/15 hover:bg-amber-500/25 text-amber-200'
                }`}
              >
                {isPro ? (
                  <QrCode className="w-4 h-4 text-violet-300" />
                ) : (
                  <Lock className="w-3.5 h-3.5 text-amber-300" />
                )}
                <span>{isHindi ? 'स्कैनर' : 'Scanner'}</span>
                {!isPro ? (
                  <span className="text-[10px] font-bold uppercase text-amber-300">PRO</span>
                ) : null}
              </button>
            </div>
          ) : null}
        </div>

        {showProScannerGate && !isPro && sale ? (
          <div className="max-w-md mx-auto rounded-2xl p-4 bg-[#0B1531] border border-amber-400/40 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-200">
                <QrCode className="w-4 h-4 text-amber-300 shrink-0" />
                <span>
                  {isHindi
                    ? 'ऑटो अमाउंट-लॉक्ड पेमेंट स्कैनर (केवल Pro)'
                    : 'Auto Amount-Locked Payment Scanner (Pro Only)'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowProScannerGate(false)}
                aria-label="Close Pro scanner prompt"
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {isHindi
                ? 'बिल की सटीक राशि (लॉक्ड अमाउंट) के साथ असली PhonePe/UPI पेमेंट स्कैनर खोलने की सुविधा केवल Pro प्लान में उपलब्ध है।'
                : 'Generating a real PhonePe/UPI payment QR locked to the exact bill amount is exclusively available for Pro members.'}
            </p>
            {hasPremierAccess ? (
              <ProModeSwitch variant="card" />
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/premium/pay')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-bold"
                >
                  <Crown className="w-3.5 h-3.5" />
                  <span>{isHindi ? 'Lifetime Pro अनलॉक करें (₹199)' : 'Unlock Lifetime Pro (₹199)'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/premium')}
                  className="px-3.5 py-2 rounded-xl border border-blue-400/25 text-xs text-slate-200 hover:text-white"
                >
                  {isHindi ? 'प्लान देखें' : 'View Plans'}
                </button>
              </div>
            )}
          </div>
        ) : null}

        {showPaymentScanner && isPro && sale ? (
          <UpiPaymentQrModal
            sale={sale}
            shopProfile={shopProfile}
            shopName={shopName}
            isHindi={isHindi}
            onClose={() => setShowPaymentScanner(false)}
            onEditScanner={() => {
              setShowPaymentScanner(false);
              navigate(
                `/profile?setupScanner=1&returnTo=${encodeURIComponent(`/sales/${sale.id}`)}#payment-scanner`
              );
            }}
          />
        ) : null}

        {shareHint && whatsappPreview ? (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-400/25 text-xs text-emerald-200 flex flex-wrap items-center justify-between gap-3">
            <span>{shareHint}</span>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={whatsappPreview.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>{isHindi ? 'WhatsApp में खोलें' : 'Open WhatsApp'}</span>
              </a>
              <button
                type="button"
                onClick={() => void handleCopyBill()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-slate-100 font-medium"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? (isHindi ? 'कॉपी हो गया' : 'Copied') : isHindi ? 'बिल कॉपी करें' : 'Copy Bill'}</span>
              </button>
            </div>
          </div>
        ) : null}

        {sale && !isPro ? (
          <div className="max-w-md mx-auto rounded-xl px-4 py-3 bg-[#0D1A38] border border-blue-400/20 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="text-slate-300">
              <span className="font-semibold text-white">
                {isHindi ? 'सादा लिखित रसीद (Free Plan)' : 'Casual Text Receipt (Free Plan)'}
              </span>
              <span className="block text-[11px] text-slate-400 mt-0.5">
                {isHindi
                  ? 'PDF बिल डाउनलोड केवल Pro प्लान में मिलता है — अभी आप लिखित बिल WhatsApp या कॉपी से भेज सकते हैं।'
                  : 'PDF download is exclusive to Pro Plan — share your written text receipt on WhatsApp.'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => (hasPremierAccess ? void toggleProMode(true) : navigate('/premium/pay'))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/35 text-amber-200 font-semibold shrink-0"
            >
              <Crown className="w-3.5 h-3.5" />
              <span>
                {hasPremierAccess
                  ? isHindi
                    ? 'Pro ON करें'
                    : 'Turn Pro ON'
                  : isHindi
                    ? 'Pro लें'
                    : 'Get Pro'}
              </span>
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="glass-surface rounded-2xl p-6 text-sm text-slate-400">
            {isHindi ? 'बिल विवरण लोड हो रहा है...' : 'Loading invoice details...'}
          </div>
        ) : !sale ? (
          <div className="glass-surface rounded-2xl p-6 text-sm text-slate-400">
            {isHindi
              ? 'बिक्री रिकॉर्ड नहीं मिला या लॉगिन आवश्यक है।'
              : 'Sale record not found or requires authentication.'}
          </div>
        ) : (
          <div
            className={`max-w-md mx-auto rounded-2xl p-5 sm:p-6 space-y-4 ${
              isPro ? 'pro-card border-amber-400/30' : 'glass-surface border border-blue-400/25'
            }`}
          >
            {/* Receipt Header (Mall Style for Pro, Casual Written Header for Free) */}
            <div className="text-center space-y-1 border-b border-dashed border-blue-400/25 pb-4">
              <div className="text-[10px] uppercase tracking-widest font-semibold text-slate-400">
                {isPro
                  ? isHindi
                    ? 'Pro मॉल-स्टाइल डिजिटल बिल'
                    : 'Pro Mall-Style Digital Receipt'
                  : isHindi
                    ? 'सादा लिखित रसीद (Casual Receipt)'
                    : 'Casual Written Receipt'}
              </div>
              <div className="text-base font-bold text-white uppercase tracking-wide font-display">
                {shopName}
              </div>
              {shopProfile?.businessType ? (
                <div className="text-xs text-slate-400">{shopProfile.businessType}</div>
              ) : null}
              {shopProfile?.address ? (
                <div className="text-xs text-slate-300">{shopProfile.address}</div>
              ) : null}
              {shopProfile?.phoneNumber ? (
                <div className="text-xs text-slate-400 font-mono-num">
                  Ph: {shopProfile.phoneNumber}
                </div>
              ) : null}
              {shopProfile?.gstNumber ? (
                <div className="text-[11px] text-slate-400 font-mono-num">
                  GSTIN: {shopProfile.gstNumber}
                </div>
              ) : null}
            </div>

            {/* Bill Meta: Bill No, Date & Time, Customer Name & Phone */}
            <div className="space-y-1 text-xs border-b border-dashed border-blue-400/25 pb-3.5">
              <div className="flex justify-between">
                <span className="text-slate-400">{isHindi ? 'बिल नंबर' : 'Bill No'}</span>
                <span className="font-mono-num font-semibold text-cyan-300">{sale.invoiceId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">{isHindi ? 'तारीख और समय' : 'Date & Time'}</span>
                <span className="font-mono-num text-slate-200">
                  {new Date(sale.createdAt).toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">{isHindi ? 'ग्राहक का नाम' : 'Customer'}</span>
                <span className="text-white font-medium">
                  {sale.customerName || (isHindi ? 'वॉक-इन ग्राहक' : 'Walk-in Customer')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">{isHindi ? 'ग्राहक फ़ोन' : 'Customer Phone'}</span>
                <span className="font-mono-num text-slate-200">
                  {resolvedPhone || '—'}
                </span>
              </div>
            </div>

            {/* Items Table */}
            <div className="space-y-2 border-b border-dashed border-blue-400/25 pb-3.5">
              <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400 pb-1">
                <span>{isHindi ? 'सामान · मात्रा × कीमत' : 'Item · Qty × Price'}</span>
                <span>{isHindi ? 'राशि' : 'Amount'}</span>
              </div>
              {sale.items.map((item) => (
                <div key={item.id} className="flex justify-between items-start text-sm py-1 gap-3">
                  <div className="min-w-0">
                    <div className="text-slate-100 font-medium break-words">{item.name}</div>
                    <div className="text-xs text-slate-400 font-mono-num">
                      {formatSaleItemQuantity(item)} × {formatINR(item.unitPrice)}
                    </div>
                  </div>
                  <span className="font-mono-num text-white shrink-0 font-semibold">
                    {formatINR(item.lineTotal)}
                  </span>
                </div>
              ))}
            </div>

            {/* Totals & Payment Details */}
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>{isHindi ? 'उप-कुल' : 'Subtotal'}</span>
                <span className="font-mono-num">{formatINR(sale.subtotal)}</span>
              </div>
              {sale.discount > 0 ? (
                <div className="flex justify-between text-emerald-300">
                  <span>{isHindi ? 'छूट (Discount)' : 'Discount'}</span>
                  <span className="font-mono-num">-{formatINR(sale.discount)}</span>
                </div>
              ) : null}
              <div className="pt-2 border-t border-dashed border-blue-400/25 flex justify-between items-center">
                <span className="text-sm font-bold text-white">
                  {isHindi ? 'कुल राशि' : 'GRAND TOTAL'}
                </span>
                <span className="text-lg font-bold font-mono-num text-cyan-300">
                  {formatINR(sale.finalTotal)}
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-dashed border-blue-400/25 space-y-1 text-xs text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">{isHindi ? 'भुगतान का तरीका' : 'Payment Method'}</span>
                <span className="uppercase font-semibold text-white">{sale.paymentMethod}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">{isHindi ? 'भुगतान स्थिति' : 'Payment Status'}</span>
                <span className={sale.dueAmount > 0 ? 'text-amber-300 font-medium' : 'text-emerald-300 font-medium'}>
                  {paymentStatusLabel}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">{isHindi ? 'जमा राशि' : 'Paid Amount'}</span>
                <span className="font-mono-num text-emerald-300">{formatINR(sale.paidAmount)}</span>
              </div>
              {sale.dueAmount > 0 ? (
                <div className="flex justify-between">
                  <span className="text-slate-400">{isHindi ? 'बकाया (उधार)' : 'Balance Due'}</span>
                  <span className="font-mono-num text-amber-300 font-semibold">
                    {formatINR(sale.dueAmount)}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="pt-2 text-center text-[11px] text-slate-400 border-t border-dashed border-blue-400/25">
              {isHindi ? 'धन्यवाद! फिर पधारें 🙏' : 'THANK YOU! VISIT AGAIN'}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
