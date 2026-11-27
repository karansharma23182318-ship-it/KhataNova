import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Lock,
  QrCode,
  Settings2,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { Sale, ShopProfile } from '../../types/models';
import { formatINR } from '../../utils/finance';
import {
  buildLockedUpiPaymentUri,
  generateUpiQrMatrix,
  normalizeUpiId,
} from '../../utils/upiScanner';

interface UpiPaymentQrModalProps {
  sale: Sale;
  shopProfile: ShopProfile | null;
  shopName: string;
  isHindi: boolean;
  onClose: () => void;
  onEditScanner: () => void;
}

export function UpiQrCodeSvg({ uri, size = 232 }: { uri: string; size?: number }) {
  const matrix = useMemo(() => {
    try {
      return generateUpiQrMatrix(uri);
    } catch {
      return null;
    }
  }, [uri]);

  if (!matrix) {
    return (
      <div className="w-56 h-56 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500">
        <QrCode className="w-16 h-16" />
      </div>
    );
  }

  const quiet = 4;
  const totalSize = matrix.size + quiet * 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`${-quiet} ${-quiet} ${totalSize} ${totalSize}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="Locked amount UPI payment QR code"
      className="block rounded-xl bg-white"
    >
      <rect x={-quiet} y={-quiet} width={totalSize} height={totalSize} fill="#FFFFFF" />
      {matrix.modules.map((row, y) =>
        row.map((cell, x) =>
          cell ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#0F172A" /> : null
        )
      )}
    </svg>
  );
}

export function UpiPaymentQrModal({
  sale,
  shopProfile,
  shopName,
  isHindi,
  onClose,
  onEditScanner,
}: UpiPaymentQrModalProps) {
  const [copiedUpi, setCopiedUpi] = useState(false);

  const upiId = normalizeUpiId(shopProfile?.paymentUpiId);
  const lockedUri = useMemo(
    () =>
      buildLockedUpiPaymentUri({
        upiId,
        shopName,
        amount: sale.finalTotal,
        invoiceId: sale.invoiceId,
      }),
    [upiId, shopName, sale.finalTotal, sale.invoiceId]
  );

  const handleCopyUpi = async () => {
    if (!upiId) return;
    try {
      await navigator.clipboard.writeText(upiId);
      setCopiedUpi(true);
      window.setTimeout(() => setCopiedUpi(false), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upi-payment-scanner-title"
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="w-full max-w-md pro-card rounded-2xl border border-violet-400/40 bg-[#0A132C] shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-violet-700/35 via-indigo-700/25 to-cyan-700/20 border-b border-violet-400/25 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-violet-500/25 border border-violet-400/45 flex items-center justify-center text-violet-200 shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="upi-payment-scanner-title"
                className="text-sm font-bold text-white truncate"
              >
                {isHindi ? 'PhonePe / UPI पेमेंट स्कैनर' : 'PhonePe / UPI Payment Scanner'}
              </h2>
              <p className="text-[11px] text-violet-200/85 truncate">
                {shopName} · {sale.invoiceId}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isHindi ? 'स्कैनर बंद करें' : 'Close payment scanner'}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Locked Non-Editable Amount Header */}
          <div className="rounded-xl p-3.5 bg-emerald-500/10 border border-emerald-400/30 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] text-emerald-200/85 font-medium">
                {isHindi ? 'स्कैन करने पर ऑटोमैटिक राशि' : 'Exact Bill Amount to Pay'}
              </div>
              <div className="text-2xl font-bold font-mono-num text-white mt-0.5">
                {formatINR(sale.finalTotal)}
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-[11px] font-semibold shrink-0">
              <Lock className="w-3.5 h-3.5" />
              <span>{isHindi ? 'राशि लॉक है' : 'Amount Locked'}</span>
            </div>
          </div>

          {lockedUri ? (
            <div className="rounded-2xl bg-white p-4 text-slate-900 flex flex-col items-center gap-3 shadow-inner">
              <div className="flex items-center gap-2 text-xs font-bold text-violet-800 tracking-wide uppercase">
                <ShieldCheck className="w-4 h-4 text-violet-700" />
                <span>PhonePe · GPay · Paytm · BHIM</span>
              </div>

              <UpiQrCodeSvg uri={lockedUri} size={232} />

              <div className="w-full pt-1 border-t border-slate-200 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                    {isHindi ? 'दुकानदार UPI ID' : 'Payee UPI ID'}
                  </div>
                  <div className="font-mono-num font-bold text-slate-900 truncate">{upiId}</div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopyUpi()}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold shrink-0"
                >
                  {copiedUpi ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedUpi ? (isHindi ? 'कॉपी' : 'Copied') : isHindi ? 'कॉपी' : 'Copy'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-400/30 text-xs text-rose-200 leading-relaxed">
              {sale.finalTotal <= 0
                ? isHindi
                  ? '₹0 बिल के लिए UPI पेमेंट स्कैनर की आवश्यकता नहीं है।'
                  : 'Cannot generate a payment QR for a ₹0 bill.'
                : isHindi
                  ? 'सही UPI ID सेव नहीं है। कृपया Shop Profile में अपनी UPI ID जांचें।'
                  : 'Valid UPI ID is missing. Please update your UPI ID in Shop Profile.'}
            </div>
          )}

          {/* Reference badge to Shopkeeper's saved gallery QR */}
          {shopProfile?.paymentQrUrl ? (
            <div className="rounded-xl p-2.5 bg-[#0D1936] border border-blue-400/20 flex items-center gap-3">
              <img
                src={shopProfile.paymentQrUrl}
                alt="Saved shop payment scanner"
                className="w-11 h-11 rounded-lg object-cover bg-white shrink-0 border border-white/15"
              />
              <div className="min-w-0 flex-1 text-[11px] text-slate-300 leading-snug">
                <div className="font-semibold text-white">
                  {isHindi ? 'आपके सेव किए गए स्कैनर से लिंक है' : 'Linked to Your Saved Shop Scanner'}
                </div>
                <div className="text-slate-400">
                  {isHindi
                    ? `स्कैन करने पर सीधे ${formatINR(sale.finalTotal)} बिना बदले दिखेगा।`
                    : `Scanning locks ${formatINR(sale.finalTotal)} directly without price editing.`}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-400 leading-relaxed text-center">
              {isHindi
                ? `ग्राहक जब इसे PhonePe, Google Pay या Paytm से स्कैन करेंगे, तो ${formatINR(sale.finalTotal)} की राशि सीधे ${upiId} पर लॉक होकर दिखेगी।`
                : `When scanned in PhonePe, Google Pay, or Paytm, ${formatINR(sale.finalTotal)} is pre-filled and locked for ${upiId}.`}
            </p>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={onEditScanner}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-blue-400/25 text-xs text-slate-200 hover:text-white hover:bg-white/5"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>{isHindi ? 'स्कैनर / UPI बदलें' : 'Edit Scanner / UPI'}</span>
            </button>

            <div className="flex items-center gap-2 ml-auto">
              {lockedUri ? (
                <a
                  href={lockedUri}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{isHindi ? 'UPI ऐप में खोलें' : 'Open UPI App'}</span>
                </a>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white"
              >
                {isHindi ? 'बंद करें' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
