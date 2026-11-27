import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Crown,
  ImagePlus,
  QrCode,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { AppLayout } from '../../components/layout/AppLayout';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import {
  compressGalleryImageToDataUrl,
  isLikelyImageFile,
  tryDecodeUpiIdFromImageUrl,
} from '../../utils/galleryImage';
import { isValidUpiId, normalizeUpiId } from '../../utils/upiScanner';

export function ShopProfile() {
  const { t, language } = useLanguage();
  const { user, shopProfile, isProMode, saveShopSetup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const scannerSectionRef = useRef<HTMLDivElement | null>(null);
  const scannerFileRef = useRef<HTMLInputElement | null>(null);

  const isHindi = language === 'hi';
  const setupScannerPrompt = searchParams.get('setupScanner') === '1';
  const returnTo = searchParams.get('returnTo');

  const [ownerName, setOwnerName] = useState(shopProfile?.ownerName || user?.displayName || '');
  const [shopName, setShopName] = useState(shopProfile?.shopName || '');
  const [phoneNumber, setPhoneNumber] = useState(shopProfile?.phoneNumber || '');
  const [whatsappNumber, setWhatsappNumber] = useState(shopProfile?.whatsappNumber || '');
  const [businessType, setBusinessType] = useState(shopProfile?.businessType || 'Retail Store');
  const [address, setAddress] = useState(shopProfile?.address || '');
  const [gstNumber, setGstNumber] = useState(shopProfile?.gstNumber || '');
  const [email, setEmail] = useState(shopProfile?.email || user?.email || '');
  const [aboutBusiness, setAboutBusiness] = useState(shopProfile?.aboutBusiness || '');
  const [paymentUpiId, setPaymentUpiId] = useState(shopProfile?.paymentUpiId || '');
  const [paymentQrUrl, setPaymentQrUrl] = useState(shopProfile?.paymentQrUrl || '');

  const [processingQr, setProcessingQr] = useState(false);
  const [qrNotice, setQrNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedReturnReady, setSavedReturnReady] = useState(false);

  // Sync form state whenever shopProfile finishes loading from API/Firestore
  useEffect(() => {
    if (!shopProfile) return;
    setOwnerName(shopProfile.ownerName || user?.displayName || '');
    setShopName(shopProfile.shopName || '');
    setPhoneNumber(shopProfile.phoneNumber || '');
    setWhatsappNumber(shopProfile.whatsappNumber || '');
    setBusinessType(shopProfile.businessType || 'Retail Store');
    setAddress(shopProfile.address || '');
    setGstNumber(shopProfile.gstNumber || '');
    setEmail(shopProfile.email || user?.email || '');
    setAboutBusiness(shopProfile.aboutBusiness || '');
    setPaymentUpiId(shopProfile.paymentUpiId || '');
    setPaymentQrUrl(shopProfile.paymentQrUrl || '');
  }, [shopProfile, user?.displayName, user?.email]);

  // Auto-scroll to Payment Scanner setup card when redirected from an Invoice
  useEffect(() => {
    if (setupScannerPrompt || location.hash === '#payment-scanner') {
      window.setTimeout(() => {
        scannerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    }
  }, [setupScannerPrompt, location.hash]);

  const handleGalleryQrSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!isLikelyImageFile(file)) {
      setQrNotice({
        type: 'error',
        text: isHindi
          ? 'कृपया गैलरी से सही इमेज फ़ाइल (PNG, JPG, WebP या स्क्रीनशॉट) चुनें।'
          : 'Please choose a valid image file (PNG, JPG, WebP, or screenshot) from gallery.',
      });
      return;
    }

    setProcessingQr(true);
    setQrNotice(null);
    try {
      const optimized = await compressGalleryImageToDataUrl(file);
      setPaymentQrUrl(optimized);
      const detectedUpi = await tryDecodeUpiIdFromImageUrl(optimized);
      if (detectedUpi && !paymentUpiId.trim()) {
        setPaymentUpiId(detectedUpi);
        setQrNotice({
          type: 'success',
          text: isHindi
            ? `गैलरी से स्कैनर अपलोड हो गया और UPI ID (${detectedUpi}) अपने-आप भर गई। अब "Save" दबाएँ।`
            : `Scanner uploaded from gallery and UPI ID (${detectedUpi}) detected automatically. Click Save.`,
        });
      } else {
        setQrNotice({
          type: 'success',
          text: isHindi
            ? 'गैलरी से स्कैनर इमेज लोड हो गई है। नीचे अपनी UPI ID टाइप करें और "Save" दबाएँ।'
            : 'Scanner image loaded from gallery. Type your UPI ID below and click Save.',
        });
      }
    } catch (err) {
      setQrNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to process selected QR image.',
      });
    } finally {
      setProcessingQr(false);
    }
  };

  const handleRemoveScanner = () => {
    setPaymentQrUrl('');
    setQrNotice({
      type: 'success',
      text: isHindi
        ? 'स्कैनर फोटो हटा दी गई है। बदलाव लागू करने के लिए "Save" दबाएँ।'
        : 'Scanner image removed. Click Save to apply.',
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setStatus({
        type: 'error',
        text: isHindi
          ? 'प्रोफ़ाइल और पेमेंट स्कैनर सेव करने के लिए कृपया पहले Google से लॉगिन करें।'
          : 'Please sign in with Google first.',
      });
      return;
    }

    const cleanUpi = normalizeUpiId(paymentUpiId);
    if (cleanUpi && !isValidUpiId(cleanUpi)) {
      setStatus({
        type: 'error',
        text: isHindi
          ? 'कृपया सही UPI ID लिखें (जैसे: 9876543210@ybl या shop@okicici)।'
          : 'Please enter a valid UPI ID (e.g. 9876543210@ybl or shop@okicici).',
      });
      return;
    }

    if (paymentQrUrl && !cleanUpi) {
      setStatus({
        type: 'error',
        text: isHindi
          ? 'अमाउंट-लॉक्ड पेमेंट स्कैनर बनाने के लिए कृपया स्कैनर के साथ अपनी UPI ID भी टाइप करें।'
          : 'Please also type your UPI ID along with the scanner photo so amount-locked QRs can be generated.',
      });
      return;
    }

    setSaving(true);
    setStatus(null);
    try {
      await saveShopSetup({
        ownerName,
        shopName,
        phoneNumber,
        whatsappNumber,
        businessType,
        address,
        gstNumber,
        email,
        aboutBusiness,
        paymentUpiId: cleanUpi,
        paymentQrUrl,
        stockManagementEnabled: shopProfile?.stockManagementEnabled ?? false,
        reminderEnabled: shopProfile?.reminderEnabled ?? true,
        reminderIntervalDays: shopProfile?.reminderIntervalDays ?? 7,
      });
      setStatus({
        type: 'success',
        text: isHindi
          ? 'दुकान प्रोफ़ाइल और UPI पेमेंट स्कैनर सफलतापूर्वक सेव हो गए!'
          : 'Shop profile and UPI payment scanner saved successfully!',
      });
      if (returnTo && cleanUpi) {
        setSavedReturnReady(true);
      }
    } catch (err) {
      setStatus({
        type: 'error',
        text: err instanceof Error ? err.message : 'Save failed',
      });
    } finally {
      setSaving(false);
    }
  };

  const hasValidSavedUpi = isValidUpiId(paymentUpiId);

  return (
    <AppLayout title={t('nav.profile')}>
      <form onSubmit={handleSave} className="max-w-2xl space-y-6">
        {setupScannerPrompt ? (
          <div className="p-4 rounded-2xl bg-violet-600/15 border border-violet-400/40 text-xs text-violet-100 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="font-semibold text-sm text-white flex items-center gap-2">
                <QrCode className="w-4 h-4 text-violet-300" />
                <span>
                  {isHindi
                    ? 'बिल पर PhonePe / UPI पेमेंट स्कैनर दिखाने के लिए पहले सेटअप करें'
                    : 'Save Your UPI Payment Scanner First'}
                </span>
              </div>
              <p className="text-violet-200/85 leading-relaxed">
                {isHindi
                  ? 'गैलरी से अपना PhonePe/UPI स्कैनर फोटो अपलोड करें और नीचे अपनी UPI ID टाइप करके Save करें। इसके बाद हर बिल की सही राशि वाला लाइव पेमेंट स्कैनर तुरंत खुलेगा।'
                  : 'Upload your PhonePe/UPI scanner photo from gallery and type your UPI ID below. Once saved, every invoice will generate a real amount-locked payment QR.'}
              </p>
            </div>
            {returnTo ? (
              <button
                type="button"
                onClick={() => navigate(returnTo)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium text-white"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{isHindi ? 'बिल पर वापस जाएँ' : 'Back to Invoice'}</span>
              </button>
            ) : null}
          </div>
        ) : null}

        {status ? (
          <div
            role="status"
            className={`p-3.5 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-3 ${
              status.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-200'
                : 'bg-rose-500/10 border-rose-400/30 text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{status.text}</span>
            </div>
            {savedReturnReady && returnTo ? (
              <button
                type="button"
                onClick={() => navigate(returnTo)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{isHindi ? 'बिल पर जाकर स्कैनर खोलें' : 'Open Scanner on Invoice'}</span>
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Shop Basic Details */}
        <div className="glass-surface rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-white">
            {isHindi ? 'दुकान की जानकारी (Shop Details)' : 'Shop Information'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-300 mb-1.5">Owner Name (Optional)</label>
              <input
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1.5">Shop Name *</label>
              <input
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1.5">Phone Number *</label>
              <input
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1.5">WhatsApp Number (Optional)</label>
              <input
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1.5">Business Category *</label>
              <input
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1.5">GST Number (Optional)</label>
              <input
                value={gstNumber}
                onChange={(e) => setGstNumber(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white font-mono-num"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-300 mb-1.5">Address *</label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-300 mb-1.5">Email (Optional)</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-300 mb-1.5">About Business</label>
              <textarea
                value={aboutBusiness}
                onChange={(e) => setAboutBusiness(e.target.value)}
                rows={2}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white"
              />
            </div>
          </div>
        </div>

        {/* Shop Payment Scanner & UPI ID (Gallery Upload + Typing) */}
        <div
          id="payment-scanner"
          ref={scannerSectionRef}
          className={`rounded-2xl p-6 space-y-4 ${
            setupScannerPrompt
              ? 'pro-card border-2 border-violet-400/60 shadow-lg shadow-violet-950/30'
              : 'glass-surface border border-violet-400/30'
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-violet-300" />
                <h2 className="text-sm font-semibold text-white">
                  {isHindi
                    ? 'पेमेंट स्कैनर और UPI ID (PhonePe / GPay / Paytm)'
                    : 'Payment Scanner & UPI ID (PhonePe / GPay / Paytm)'}
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                {isHindi
                  ? 'गैलरी से अपनी दुकान का QR स्कैनर अपलोड करें और अपनी UPI ID टाइप करें। Pro बिल पर क्लिक करते ही सटीक लॉक्ड राशि वाला असली UPI QR बनेगा।'
                  : 'Upload your shop QR scanner directly from gallery and type your UPI ID. Pro invoices automatically generate an amount-locked real UPI QR.'}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-400/35 text-amber-200 text-[11px] font-bold shrink-0">
              <Crown className="w-3 h-3" />
              <span>{isProMode ? 'PRO ACTIVE' : 'PRO FEATURE'}</span>
            </span>
          </div>

          {qrNotice ? (
            <div
              className={`p-3 rounded-xl border text-xs ${
                qrNotice.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-200'
                  : 'bg-rose-500/10 border-rose-400/30 text-rose-200'
              }`}
            >
              {qrNotice.text}
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 items-start">
            <div className="sm:col-span-3 space-y-4">
              {/* Step 1: Gallery Upload */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-300">
                  {isHindi
                    ? '1. गैलरी से स्कैनर इमेज अपलोड करें (Gallery Upload)'
                    : '1. Upload Payment Scanner Photo from Gallery'}
                </label>
                <input
                  ref={scannerFileRef}
                  id="shop-scanner-gallery-input"
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handleGalleryQrSelected(e)}
                  className="hidden"
                />
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    disabled={processingQr}
                    onClick={() => scannerFileRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 text-white text-xs font-semibold shadow-sm"
                  >
                    <ImagePlus className="w-4 h-4" />
                    <span>
                      {processingQr
                        ? isHindi
                          ? 'इमेज लोड हो रही है...'
                          : 'Loading Image...'
                        : isHindi
                          ? 'गैलरी से स्कैनर चुनें'
                          : 'Select Scanner from Gallery'}
                    </span>
                  </button>
                  {paymentQrUrl ? (
                    <button
                      type="button"
                      onClick={handleRemoveScanner}
                      className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-rose-200 text-xs font-medium"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isHindi ? 'हटाएँ' : 'Remove'}</span>
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Step 2: Typed UPI ID */}
              <div>
                <label
                  htmlFor="shop-payment-upi-id"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  {isHindi
                    ? '2. दुकानदार UPI ID टाइप करें (जैसे: 9876543210@ybl) *'
                    : '2. Type Your UPI ID (e.g. 9876543210@ybl) *'}
                </label>
                <input
                  id="shop-payment-upi-id"
                  type="text"
                  value={paymentUpiId}
                  onChange={(e) => setPaymentUpiId(e.target.value)}
                  placeholder="8757209126@ybl / yourshop@okicici"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-violet-400/30 text-sm text-white font-mono-num placeholder:text-slate-400/55 focus:outline-none focus:border-violet-400"
                />
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
                  {hasValidSavedUpi ? (
                    <span className="text-emerald-300 inline-flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {isHindi
                        ? 'सही UPI ID — हर बिल के लिए ऑटो अमाउंट-लॉक्ड QR तैयार है।'
                        : 'Valid UPI ID — ready to generate exact locked-amount invoice QRs.'}
                    </span>
                  ) : (
                    <span className="text-slate-400">
                      {isHindi
                        ? 'PhonePe (@ybl / @axl / @ibl), GPay (@okicici / @oksbi), Paytm (@ptyes) कोई भी सही UPI ID डालें।'
                        : 'Supports any valid PhonePe, GPay, Paytm, or BHIM UPI ID.'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Scanner Preview Box */}
            <div className="sm:col-span-2">
              <div className="rounded-xl p-3 bg-[#0A142D] border border-blue-400/20 flex flex-col items-center justify-center gap-2 min-h-[170px]">
                {paymentQrUrl ? (
                  <>
                    <img
                      src={paymentQrUrl}
                      alt="Uploaded Shop Payment Scanner"
                      className="w-36 h-36 object-contain rounded-lg bg-white p-1"
                    />
                    <span className="text-[11px] text-emerald-300 font-medium">
                      {isHindi ? 'स्कैनर सेलेक्ट हो गया' : 'Scanner Loaded'}
                    </span>
                  </>
                ) : (
                  <div className="text-center space-y-1.5 py-4 px-2">
                    <QrCode className="w-9 h-9 text-slate-500 mx-auto" />
                    <p className="text-[11px] text-slate-400">
                      {isHindi
                        ? 'गैलरी से चुना गया स्कैनर यहाँ दिखेगा'
                        : 'Gallery scanner preview appears here'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {returnTo ? (
            <button
              type="button"
              onClick={() => navigate(returnTo)}
              className="px-4 py-2.5 rounded-xl border border-blue-400/25 text-sm text-slate-200 hover:text-white"
            >
              {isHindi ? 'रद्द करें' : 'Cancel'}
            </button>
          ) : null}
          <button
            type="submit"
            disabled={saving || processingQr}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-semibold"
          >
            {saving
              ? isHindi
                ? 'सेव हो रहा है...'
                : 'Saving...'
              : isHindi
                ? 'प्रोफ़ाइल व स्कैनर सेव करें'
                : t('common.save')}
          </button>
        </div>
      </form>
    </AppLayout>
  );
}
