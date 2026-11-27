import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Barcode,
  Calculator,
  Camera,
  Check,
  Crown,
  Lock,
  Plus,
  ScanBarcode,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react';
import { AppLayout } from '../../components/layout/AppLayout';
import { SmartRateCalculator } from '../../components/calculator/SmartRateCalculator';
import { ProModeSwitch } from '../../components/common/ProModeSwitch';
import { BarcodeCameraScanner } from '../../components/scanner/BarcodeCameraScanner';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { listCustomers } from '../../services/customerService';
import { saveRateBookItem } from '../../services/localVault';
import {
  listNovaProducts,
  lookupBarcodeGlobal,
  saveNovaProduct,
} from '../../services/novaScanService';
import { createAtomicSale } from '../../services/salesService';
import type {
  Customer,
  GlobalProductLookupResult,
  NovaProduct,
  PaymentMethod,
  SaleItem,
} from '../../types/models';
import {
  SALE_QUANTITY_UNITS,
  calculateLineTotal,
  calculateSaleTotals,
  formatINR,
  parseQuantityInput,
} from '../../utils/finance';
import { compressGalleryImageToDataUrl, isLikelyImageFile } from '../../utils/galleryImage';
import {
  addSingleScannedProductToSaleRows,
  doPackSizesConflict,
  isValidBarcode,
  normalizeBarcode,
  shouldIgnoreDuplicateScan,
} from '../../utils/novaScan';
import { playScanBeepSound } from '../../utils/scannerSound';

interface DraftSaleRow {
  id: string;
  barcode?: string;
  productId?: string;
  imageUrl?: string;
  brand?: string;
  packSize?: string;
  categories?: string;
  savedShopPrice?: number;
  savedShopName?: string;
  isGlobalSuggestedPrice?: boolean;
  name: string;
  quantityText: string;
  priceText: string;
  unit?: string;
}

function toSaleItem(row: DraftSaleRow): SaleItem {
  const parsed = parseQuantityInput(row.quantityText);
  const unitPrice = Number(row.priceText) || 0;
  return {
    id: row.id,
    name: row.name,
    quantity: parsed.numericQty,
    ...(parsed.quantityLabel ? { quantityLabel: parsed.quantityLabel } : {}),
    unit: row.unit || 'pcs',
    unitPrice,
    lineTotal: calculateLineTotal(parsed.numericQty, unitPrice),
  };
}

export function NewSale() {
  const { user, hasPremierAccess, isProMode, shopProfile } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const shopId = shopProfile?.id || user?.uid;
  const isHindi = language === 'hi';
  const isPro = isProMode;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [customerNameInput, setCustomerNameInput] = useState('');
  const [customerPhoneInput, setCustomerPhoneInput] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [discountText, setDiscountText] = useState('');
  const [showInlineCalc, setShowInlineCalc] = useState(false);
  const [showInlineScanner, setShowInlineScanner] = useState(false);
  const [novaProducts, setNovaProducts] = useState<NovaProduct[]>([]);
  const [scanBarcodeInput, setScanBarcodeInput] = useState('');
  const [scanLookupBusy, setScanLookupBusy] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [lastScannedResult, setLastScannedResult] = useState<GlobalProductLookupResult | null>(null);
  const [unknownBarcodePrompt, setUnknownBarcodePrompt] = useState<string | null>(null);
  const [unknownName, setUnknownName] = useState('');
  const [unknownPrice, setUnknownPrice] = useState('');
  const [unknownPackSize, setUnknownPackSize] = useState('');
  const [unknownCategories, setUnknownCategories] = useState('');
  const [unknownImageUrl, setUnknownImageUrl] = useState('');
  const [savingPriceRowId, setSavingPriceRowId] = useState<string | null>(null);
  const lastCameraScanRef = useRef<{ barcode: string; timestampMs: number } | null>(null);
  const hidBufferRef = useRef<{ chars: string; lastKeyMs: number }>({ chars: '', lastKeyMs: 0 });
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<DraftSaleRow[]>(() => {
    const state = location.state as {
      preloadedItems?: Array<{ name: string; quantity: number; unitPrice: number; unit?: string }>;
    } | null;
    if (state?.preloadedItems && state.preloadedItems.length > 0) {
      return state.preloadedItems.map((item, idx) => ({
        id: `${Date.now()}-${idx}`,
        name: item.name,
        quantityText: String(item.quantity),
        priceText: String(item.unitPrice),
        unit: item.unit || 'pcs',
      }));
    }
    return [{ id: '1', name: '', quantityText: '', priceText: '', unit: 'pcs' }];
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !shopId) return;
    listCustomers(shopId).then(setCustomers).catch(console.warn);
  }, [user, shopId]);

  useEffect(() => {
    if (!user || !shopId || !isPro) {
      setNovaProducts([]);
      return;
    }
    listNovaProducts(shopId).then(setNovaProducts).catch(() => {
      // Optional local/server catalog preload
    });
  }, [user, shopId, isPro]);

  const handleInlineScanBarcode = useCallback(
    async (rawCode: string, options: { fromCamera?: boolean } = {}) => {
      if (!user || !shopId || !isPro) return;
      const cleanCode = normalizeBarcode(rawCode);
      if (!isValidBarcode(cleanCode)) {
        setScanError(
          isHindi
            ? 'अमान्य बारकोड। EAN-13, EAN-8, UPC-A, UPC-E या Code 128 स्कैन/दर्ज करें।'
            : 'Invalid barcode format. Scan or enter EAN-13, EAN-8, UPC-A, UPC-E, or Code 128.'
        );
        return;
      }

      const nowMs = Date.now();
      // One Scan, One Addition: lock repeated camera frame detection for 3.2s
      if (
        options.fromCamera &&
        shouldIgnoreDuplicateScan(lastCameraScanRef.current, cleanCode, nowMs, 3200)
      ) {
        return;
      }
      lastCameraScanRef.current = { barcode: cleanCode, timestampMs: nowMs };

      setScanLookupBusy(true);
      setScanError(null);
      setUnknownBarcodePrompt(null);
      setScanBarcodeInput(cleanCode);

      try {
        const result = await lookupBarcodeGlobal(cleanCode, shopId);
        setLastScannedResult(result);

        const localShopMatch =
          result.shopProduct ||
          novaProducts.find(
            (p) =>
              normalizeBarcode(p.barcode || '') === cleanCode &&
              !doPackSizesConflict(p.packSize, result.packSize)
          ) ||
          null;
        const resolvedName = localShopMatch?.name || result.productName;

        if (!result.found && !localShopMatch) {
          setUnknownBarcodePrompt(cleanCode);
          setUnknownName('');
          setUnknownPrice('');
          setUnknownPackSize('');
          setUnknownCategories('');
          setUnknownImageUrl('');
          setScanNotice(
            isHindi
              ? `बारकोड ${cleanCode} ग्लोबल कैटलॉग में नहीं मिला — नीचे नाम, कीमत व फोटो जोड़ें।`
              : `Barcode ${cleanCode} not found in Global DB — enter name, price & photo below.`
          );
          return;
        }

        const savedPrice =
          typeof localShopMatch?.sellingPrice === 'number' && localShopMatch.sellingPrice > 0
            ? localShopMatch.sellingPrice
            : undefined;
        const suggestedPrice =
          !savedPrice &&
          typeof result.suggestedPrice === 'number' &&
          result.suggestedPrice > 0
            ? result.suggestedPrice
            : undefined;
        const resolvedPackSize = localShopMatch?.packSize || result.packSize;
        const resolvedCategories = localShopMatch?.categories || result.categories;
        const resolvedImageUrl = localShopMatch?.imageUrl || result.imageUrl;
        const resolvedBrand = localShopMatch?.brand || result.brand;

        const rowId = `scan-${nowMs}-${Math.random().toString(36).slice(2, 6)}`;
        let needsPrice = false;
        setRows((prev) => {
          const added = addSingleScannedProductToSaleRows(prev, {
            id: rowId,
            barcode: cleanCode,
            ...(localShopMatch?.id ? { productId: localShopMatch.id } : {}),
            name: resolvedName || cleanCode,
            packSize: resolvedPackSize,
            unit: localShopMatch?.unit || result.globalProduct?.unit || 'pcs',
            savedSellingPrice: savedPrice,
            suggestedSellingPrice: suggestedPrice,
          });
          needsPrice = added.needsPriceEntry;
          return added.rows.map((r) =>
            r.id === rowId
              ? {
                  ...r,
                  ...(resolvedImageUrl ? { imageUrl: resolvedImageUrl } : {}),
                  ...(resolvedBrand ? { brand: resolvedBrand } : {}),
                  ...(resolvedPackSize ? { packSize: resolvedPackSize } : {}),
                  ...(resolvedCategories ? { categories: resolvedCategories } : {}),
                  ...(savedPrice !== undefined
                    ? {
                        savedShopPrice: savedPrice,
                        savedShopName: r.name,
                      }
                    : {}),
                  isGlobalSuggestedPrice: suggestedPrice !== undefined,
                }
              : r
          );
        });

        // Retail scanner "tttttt" beep sound on product addition
        playScanBeepSound();
        setScanNotice(
          needsPrice
            ? isHindi
              ? `जोड़ा गया: ${resolvedName || cleanCode} — कृपया नीचे बिक्री कीमत (₹) दर्ज करें।`
              : `Added: ${resolvedName || cleanCode} — enter your selling price (₹) below.`
            : suggestedPrice !== undefined
              ? isHindi
                ? `जोड़ा गया: ${resolvedName || cleanCode} (ग्लोबल सुझाया ₹${suggestedPrice} — चाहें तो बदलकर सेव करें)`
                : `Added: ${resolvedName || cleanCode} (Global Suggested ₹${suggestedPrice})`
              : isHindi
                ? `जोड़ा गया: ${resolvedName || cleanCode} (₹${savedPrice})`
                : `Added: ${resolvedName || cleanCode} (₹${savedPrice})`
        );
      } catch (err) {
        setScanError(
          err instanceof Error
            ? err.message
            : isHindi
              ? 'बारकोड खोजने में समस्या आई।'
              : 'Unable to look up barcode product.'
        );
      } finally {
        setScanLookupBusy(false);
      }
    },
    [user, shopId, isPro, isHindi, novaProducts]
  );

  // Hardware USB / Bluetooth HID scanner listener while compact scanner display is open
  useEffect(() => {
    if (!showInlineScanner || !isPro) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        (tag === 'input' || tag === 'textarea' || tag === 'select') &&
        target !== scanInputRef.current
      ) {
        return;
      }
      if (target === scanInputRef.current) return;

      const now = Date.now();
      const buf = hidBufferRef.current;
      if (e.key === 'Enter') {
        if (buf.chars.length >= 4 && now - buf.lastKeyMs < 250) {
          e.preventDefault();
          const scanned = buf.chars;
          hidBufferRef.current = { chars: '', lastKeyMs: 0 };
          void handleInlineScanBarcode(scanned, { fromCamera: false });
        } else {
          hidBufferRef.current = { chars: '', lastKeyMs: 0 };
        }
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        buf.chars = now - buf.lastKeyMs > 85 ? e.key : buf.chars + e.key;
        buf.lastKeyMs = now;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showInlineScanner, isPro, handleInlineScanBarcode]);

  const handleQuickAddUnknownScanned = async () => {
    if (!shopId || !unknownBarcodePrompt || !unknownName.trim()) return;
    const parsedPrice = Number(unknownPrice);
    const hasPrice = Number.isFinite(parsedPrice) && parsedPrice > 0;
    const cleanPackSize = unknownPackSize.trim() || undefined;
    const cleanCategories = unknownCategories.trim() || undefined;
    const cleanImageUrl = unknownImageUrl || undefined;
    let savedProduct: NovaProduct | null = null;
    if (hasPrice || unknownName.trim()) {
      try {
        const res = await saveNovaProduct(shopId, {
          barcode: unknownBarcodePrompt,
          name: unknownName.trim(),
          ...(cleanPackSize ? { packSize: cleanPackSize } : {}),
          ...(cleanCategories ? { categories: cleanCategories } : {}),
          ...(cleanImageUrl ? { imageUrl: cleanImageUrl } : {}),
          unit: 'pcs',
          ...(hasPrice ? { sellingPrice: parsedPrice } : {}),
          source: 'manual',
        });
        savedProduct = res.product;
        setNovaProducts(res.products);
      } catch {
        // Keep adding to current bill row even if catalog save fails
      }
    }

    const rowId = `scan-${Date.now()}`;
    setRows((prev) => {
      const added = addSingleScannedProductToSaleRows(prev, {
        id: rowId,
        barcode: unknownBarcodePrompt,
        ...(savedProduct?.id ? { productId: savedProduct.id } : {}),
        name: unknownName.trim(),
        ...(cleanPackSize ? { packSize: cleanPackSize } : {}),
        savedSellingPrice: hasPrice ? parsedPrice : undefined,
      });
      return added.rows.map((r) =>
        r.id === rowId
          ? {
              ...r,
              ...(cleanImageUrl ? { imageUrl: cleanImageUrl } : {}),
              ...(cleanPackSize ? { packSize: cleanPackSize } : {}),
              ...(cleanCategories ? { categories: cleanCategories } : {}),
              ...(hasPrice ? { savedShopPrice: parsedPrice, savedShopName: r.name } : {}),
              isGlobalSuggestedPrice: false,
            }
          : r
      );
    });
    playScanBeepSound();
    setScanNotice(
      isHindi
        ? `जोड़ा गया व Global DB में सेव: ${unknownName.trim()}`
        : `Added & saved to Global DB: ${unknownName.trim()}`
    );
    setUnknownBarcodePrompt(null);
    setUnknownName('');
    setUnknownPrice('');
    setUnknownPackSize('');
    setUnknownCategories('');
    setUnknownImageUrl('');
  };

  const handleSaveScannedRowPrice = async (row: DraftSaleRow) => {
    if (!shopId || !row.barcode || !row.name.trim()) return;
    const price = Number(row.priceText);
    if (!Number.isFinite(price) || price <= 0) return;
    setSavingPriceRowId(row.id);
    try {
      const cleanName = row.packSize
        ? row.name.replace(new RegExp(`\\s*\\(${row.packSize.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)\\s*$`), '').trim() || row.name.trim()
        : row.name.trim();
      const res = await saveNovaProduct(shopId, {
        ...(row.productId ? { id: row.productId } : {}),
        barcode: row.barcode,
        name: cleanName,
        ...(row.brand ? { brand: row.brand } : {}),
        ...(row.packSize ? { packSize: row.packSize } : {}),
        ...(row.categories ? { categories: row.categories } : {}),
        ...(row.imageUrl ? { imageUrl: row.imageUrl } : {}),
        unit: row.unit || 'pcs',
        sellingPrice: price,
        source: 'global',
      });
      setNovaProducts(res.products);
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                productId: res.product.id,
                savedShopPrice: price,
                savedShopName: r.name.trim(),
                isGlobalSuggestedPrice: false,
              }
            : r
        )
      );
      setScanNotice(
        isHindi
          ? `${cleanName} की आपकी दुकान की कीमत ₹${price} सेव हो गई।`
          : `Saved ₹${price} (${cleanName}) for your shop only.`
      );
    } catch {
      // Non-blocking
    } finally {
      setSavingPriceRowId(null);
    }
  };

  const handleCustomerSelectChange = (nextId: string) => {
    setCustomerId(nextId);
    const found = customers.find((c) => c.id === nextId);
    if (found) {
      setCustomerNameInput(found.name);
      setCustomerPhoneInput(found.mobileNumber || '');
    } else {
      setCustomerNameInput('');
      setCustomerPhoneInput('');
    }
  };

  const updateRow = (index: number, patch: Partial<DraftSaleRow>) => {
    setRows((prev) => prev.map((row, idx) => (idx === index ? { ...row, ...patch } : row)));
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { id: String(Date.now()), name: '', quantityText: '', priceText: '', unit: 'pcs' },
    ]);
  };

  const removeRow = (index: number) => {
    if (rows.length === 1) return;
    setRows((prev) => prev.filter((_, idx) => idx !== index));
  };

  const computedItems = rows.map(toSaleItem);
  const discount = Math.max(0, Number(discountText) || 0);
  const totals = calculateSaleTotals(computedItems, discount);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !shopId) {
      setError(
        isHindi
          ? 'बिक्री सेव करने के लिए कृपया पहले Google से लॉगिन करें।'
          : 'Please sign in with Google first to save a sale.'
      );
      return;
    }

    if (paymentMethod === 'udhaar' && !customerId) {
      setError(
        isHindi
          ? 'उधार बिक्री के लिए कृपया ग्राहक चुनें।'
          : 'Please select a customer for Udhaar / credit sales.'
      );
      return;
    }

    const validItems = computedItems.filter(
      (i) => i.name.trim() && i.quantity > 0 && i.unitPrice >= 0
    );
    if (validItems.length === 0) {
      setError(
        isHindi
          ? 'कम से कम एक सामान का नाम, मात्रा (Quantity) और कीमत (Price) दर्ज करें।'
          : 'Enter at least one item with Name, Quantity, and Price.'
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const selectedCust = customers.find((c) => c.id === customerId);
      const cleanName = selectedCust ? selectedCust.name : customerNameInput.trim();
      const cleanPhone = selectedCust
        ? selectedCust.mobileNumber || customerPhoneInput.trim()
        : customerPhoneInput.trim();

      const { saleId } = await createAtomicSale(shopId, user.uid, {
        ...(selectedCust ? { customerId: selectedCust.id } : {}),
        ...(cleanName ? { customerName: cleanName } : {}),
        ...(cleanPhone ? { customerPhone: cleanPhone } : {}),
        items: validItems,
        subtotal: totals.subtotal,
        discount: totals.discount,
        finalTotal: totals.finalTotal,
        paymentMethod,
      });

      // Remember valid item rates in shopkeeper's Rate Book for faster future billing
      for (const item of validItems) {
        if (item.name.trim() && item.unitPrice > 0) {
          const rateUnit =
            item.unit === 'kg' || item.unit === 'litre' || item.unit === 'dozen'
              ? item.unit
              : 'pcs';
          saveRateBookItem(user.uid, {
            name: item.name.replace(/\s*\([^)]*\)\s*$/, '').trim() || item.name.trim(),
            unit: rateUnit,
            baseRate: item.unitPrice,
          });
        }
      }

      navigate(`/sales/${saleId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create sale');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppLayout title={isHindi ? 'नई बिक्री' : 'New Sale'}>
      <form onSubmit={handleSubmit} className="max-w-4xl space-y-6">
        {error ? (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs leading-relaxed">
            {error}
          </div>
        ) : null}

        <div className={`${isPro ? 'pro-card' : 'glass-surface'} rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-2 gap-4`}>
          <div>
            <label htmlFor="sale-customer-select" className="block text-xs font-medium text-slate-300 mb-1.5">
              {isHindi ? 'ग्राहक चुनें (उधार के लिए ज़रूरी)' : 'Select Customer (Required for Udhaar)'}
            </label>
            <select
              id="sale-customer-select"
              value={customerId}
              onChange={(e) => handleCustomerSelectChange(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white focus:outline-none focus:border-cyan-400"
            >
              <option value="">{isHindi ? 'वॉक-इन / नया ग्राहक (Walk-in)' : 'Walk-in / Manual Customer'}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.mobileNumber})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="sale-payment-method" className="block text-xs font-medium text-slate-300 mb-1.5">
              {isHindi ? 'भुगतान का तरीका' : 'Payment Method'}
            </label>
            <select
              id="sale-payment-method"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white focus:outline-none focus:border-cyan-400"
            >
              <option value="cash">{isHindi ? 'नकद (Cash)' : 'Cash'}</option>
              <option value="upi">UPI</option>
              <option value="udhaar">{isHindi ? 'उधार (Credit / Udhaar)' : 'Credit / Udhaar'}</option>
            </select>
          </div>

          <div>
            <label htmlFor="sale-customer-name" className="block text-xs font-medium text-slate-300 mb-1.5">
              {isHindi ? 'ग्राहक का नाम (बिल पर दिखेगा)' : 'Customer Name (Shown on Invoice)'}
            </label>
            <input
              id="sale-customer-name"
              type="text"
              value={customerNameInput}
              readOnly={Boolean(customerId)}
              onChange={(e) => setCustomerNameInput(e.target.value)}
              placeholder={isHindi ? 'जैसे: रमेश कुमार' : 'e.g. Ramesh Kumar'}
              className={`w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white placeholder:text-slate-400/55 focus:outline-none focus:border-cyan-400 ${
                customerId ? 'opacity-80 cursor-not-allowed' : ''
              }`}
            />
          </div>

          <div>
            <label htmlFor="sale-customer-phone" className="block text-xs font-medium text-slate-300 mb-1.5">
              {isHindi ? 'ग्राहक का फ़ोन नंबर (बिल व WhatsApp के लिए)' : 'Customer Phone (Invoice & WhatsApp)'}
            </label>
            <input
              id="sale-customer-phone"
              type="tel"
              inputMode="numeric"
              value={customerPhoneInput}
              readOnly={Boolean(customerId)}
              onChange={(e) => setCustomerPhoneInput(e.target.value)}
              placeholder={isHindi ? '10 अंकों का मोबाइल नंबर' : '10-digit mobile number'}
              className={`w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white placeholder:text-slate-400/55 placeholder:font-sans tabular-nums focus:outline-none focus:border-cyan-400 ${
                customerId ? 'opacity-80 cursor-not-allowed' : ''
              }`}
            />
          </div>
        </div>

        <div className={`${isPro ? 'pro-card' : 'glass-surface'} rounded-2xl p-5 space-y-4`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">
              {isHindi ? 'सामान (Items)' : 'Items'}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowInlineScanner((prev) => !prev)}
                aria-expanded={showInlineScanner}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  showInlineScanner
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : isPro
                      ? 'bg-amber-500/15 border-amber-400/40 text-amber-200 hover:bg-amber-500/25'
                      : 'bg-amber-500/10 border-amber-400/30 text-amber-200 hover:bg-amber-500/20'
                }`}
              >
                {isPro ? (
                  <ScanBarcode className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <Lock
                    className={`w-3.5 h-3.5 shrink-0 ${
                      showInlineScanner ? 'text-slate-950' : 'text-amber-300'
                    }`}
                  />
                )}
                <span>{isHindi ? 'स्कैन' : 'Scan'}</span>
                {!isPro ? (
                  <span
                    className={`text-[10px] font-bold uppercase ${
                      showInlineScanner ? 'text-slate-950' : 'text-amber-300'
                    }`}
                  >
                    PRO
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => setShowInlineCalc((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-400/30 text-xs font-medium text-cyan-200 hover:bg-cyan-500/25 whitespace-nowrap shrink-0"
              >
                <Calculator className="w-3.5 h-3.5 shrink-0" />
                <span>{isHindi ? 'वज़न/रेट कैलकुलेटर' : 'Rate Calculator'}</span>
              </button>
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-400/30 text-xs font-medium text-cyan-300 hover:bg-blue-600/30 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>{isHindi ? 'और जोड़ें' : 'Add Row'}</span>
              </button>
            </div>
          </div>

          {showInlineScanner ? (
            <div className="rounded-xl p-3.5 sm:p-4 bg-[#081024] border border-amber-400/35 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-200">
                  <ScanBarcode className="w-4 h-4 text-amber-300 shrink-0" />
                  <span>
                    {isHindi
                      ? 'Nova Scan – लाइव बिलिंग स्कैनर (Pro)'
                      : 'Nova Scan – Quick Billing Scanner (Pro)'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInlineScanner(false)}
                  aria-label="Close scanner"
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {!isPro ? (
                <div className="space-y-3 pt-1">
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {isHindi
                      ? 'कैमरा व USB/Bluetooth से तुरंत बारकोड स्कैन करके बिल में सामान जोड़ने की सुविधा केवल Pro प्लान में उपलब्ध है।'
                      : 'Instant camera & USB/Bluetooth barcode scanning directly inside New Sale is exclusively available for Pro subscribers.'}
                  </p>
                  {hasPremierAccess ? (
                    <ProModeSwitch variant="card" />
                  ) : (
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => navigate('/premium/pay')}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-bold"
                      >
                        <Crown className="w-3.5 h-3.5" />
                        <span>
                          {isHindi
                            ? 'Lifetime Pro अनलॉक करें (₹199)'
                            : 'Unlock Lifetime Pro (₹199)'}
                        </span>
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
              ) : (
                <div className="space-y-3">
                  <BarcodeCameraScanner
                    variant="compact"
                    autoStart
                    isHindi={isHindi}
                    isPro={isPro}
                    onBarcodeDetected={(code) =>
                      void handleInlineScanBarcode(code, { fromCamera: true })
                    }
                    lastScanLabel={scanNotice}
                  />

                  <div className="flex gap-2">
                    <div className="relative flex-1 min-w-0">
                      <Barcode className="w-4 h-4 text-amber-300 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        ref={scanInputRef}
                        type="text"
                        value={scanBarcodeInput}
                        onChange={(e) => setScanBarcodeInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void handleInlineScanBarcode(scanBarcodeInput, { fromCamera: false });
                          }
                        }}
                        placeholder={
                          isHindi
                            ? 'बारकोड स्कैन करें या लिखें (जैसे 8909106046351)'
                            : 'Scan or enter barcode (e.g. 8909106046351)'
                        }
                        aria-label="Scan barcode input"
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#0A142D] border border-blue-400/25 text-xs text-white font-mono-num placeholder:font-sans placeholder:text-slate-400/60 focus:outline-none focus:border-amber-400"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={scanLookupBusy || !scanBarcodeInput.trim()}
                      onClick={() =>
                        void handleInlineScanBarcode(scanBarcodeInput, { fromCamera: false })
                      }
                      className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold whitespace-nowrap shrink-0"
                    >
                      {scanLookupBusy
                        ? isHindi
                          ? 'खोज रहा है...'
                          : 'Scanning...'
                        : isHindi
                          ? 'स्कैन जोड़ें'
                          : 'Add Scan'}
                    </button>
                  </div>

                  {scanError ? (
                    <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-400/35 text-xs text-rose-200">
                      {scanError}
                    </div>
                  ) : null}

                  {lastScannedResult && lastScannedResult.found ? (
                    <div className="p-2.5 rounded-xl bg-[#0A142D] border border-cyan-400/25 flex items-center gap-3">
                      {lastScannedResult.imageUrl ? (
                        <img
                          src={lastScannedResult.imageUrl}
                          alt={lastScannedResult.productName || lastScannedResult.barcode}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-lg object-contain bg-white/95 p-0.5 shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-[#0E1A36] border border-blue-400/20 flex items-center justify-center shrink-0 text-slate-400">
                          <ShoppingBag className="w-4 h-4" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1 text-xs">
                        <div className="font-semibold text-white truncate">
                          {lastScannedResult.productName || lastScannedResult.barcode}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {lastScannedResult.barcode}
                          {lastScannedResult.brand ? ` · ${lastScannedResult.brand}` : ''}
                          {lastScannedResult.packSize ? ` · ${lastScannedResult.packSize}` : ''}
                          {lastScannedResult.categories ? ` · ${lastScannedResult.categories}` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          void handleInlineScanBarcode(lastScannedResult.barcode, {
                            fromCamera: false,
                          })
                        }
                        className="px-2.5 py-1 rounded-lg bg-blue-600/25 hover:bg-blue-600/40 border border-cyan-400/30 text-[11px] font-medium text-cyan-200 whitespace-nowrap shrink-0"
                      >
                        {isHindi ? '+ फिर से जोड़ें' : '+ Rescan'}
                      </button>
                    </div>
                  ) : null}

                  {unknownBarcodePrompt ? (
                    <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-400/35 space-y-2.5 text-xs">
                      <div className="text-amber-200 font-medium">
                        {isHindi
                          ? `बारकोड ${unknownBarcodePrompt} नहीं मिला — सभी दुकानदारों के लिए जोड़ें:`
                          : `Barcode ${unknownBarcodePrompt} not found — add to your shop & Global DB:`}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                        <input
                          type="text"
                          value={unknownName}
                          onChange={(e) => setUnknownName(e.target.value)}
                          placeholder={isHindi ? 'सामान का नाम *' : 'Product Name *'}
                          className="sm:col-span-2 px-3 py-2 rounded-xl bg-[#0A142D] border border-blue-400/25 text-white text-xs"
                        />
                        <input
                          type="text"
                          value={unknownPackSize}
                          onChange={(e) => setUnknownPackSize(e.target.value)}
                          placeholder={isHindi ? 'पैक (100g)' : 'Pack (100g)'}
                          className="px-3 py-2 rounded-xl bg-[#0A142D] border border-blue-400/25 text-white text-xs"
                        />
                        <input
                          type="text"
                          value={unknownCategories}
                          onChange={(e) => setUnknownCategories(e.target.value)}
                          placeholder={isHindi ? 'कैटेगरी' : 'Category'}
                          className="px-3 py-2 rounded-xl bg-[#0A142D] border border-blue-400/25 text-white text-xs"
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={unknownPrice}
                          onChange={(e) => setUnknownPrice(e.target.value)}
                          placeholder={isHindi ? 'कीमत ₹ *' : 'Price ₹'}
                          className="px-3 py-2 rounded-xl bg-[#0A142D] border border-blue-400/25 text-white text-xs font-mono-num"
                        />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-600/20 border border-cyan-400/30 text-cyan-200 text-[11px] font-semibold cursor-pointer">
                            <Camera className="w-3.5 h-3.5" />
                            <span>{isHindi ? 'फोटो चुनें' : 'Add Photo'}</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={async (e) => {
                                const f = e.target.files?.[0];
                                e.target.value = '';
                                if (f && isLikelyImageFile(f)) {
                                  setUnknownImageUrl(await compressGalleryImageToDataUrl(f));
                                }
                              }}
                            />
                          </label>
                          {unknownImageUrl ? (
                            <img
                              src={unknownImageUrl}
                              alt="Product preview"
                              className="w-8 h-8 rounded-lg object-contain bg-white p-0.5 border border-cyan-400/30"
                            />
                          ) : null}
                        </div>
                        <button
                          type="button"
                          disabled={!unknownName.trim()}
                          onClick={() => void handleQuickAddUnknownScanned()}
                          className="px-4 py-1.5 rounded-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs"
                        >
                          {isHindi ? 'बिल व Global DB में जोड़ें' : 'Save & Add to Bill'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          {showInlineCalc ? (
            <div className="pb-2">
              <SmartRateCalculator
                variant="inline"
                onAddLineToBill={(line) => {
                  setRows((prev) => {
                    const isFirstEmpty =
                      prev.length === 1 &&
                      !prev[0].name.trim() &&
                      !prev[0].quantityText &&
                      !prev[0].priceText;
                    const newRow: DraftSaleRow = {
                      id: String(Date.now()),
                      name: line.name,
                      quantityText: String(line.quantity),
                      priceText: String(line.unitPrice),
                    };
                    return isFirstEmpty ? [newRow] : [...prev, newRow];
                  });
                }}
              />
            </div>
          ) : null}

          <div className="space-y-3">
            {rows.map((row, idx) => {
              const parsedQty = parseQuantityInput(row.quantityText);
              const lineTotal = calculateLineTotal(
                parsedQty.numericQty,
                Number(row.priceText) || 0
              );
              const selectedUnit = row.unit || 'pcs';
              const isCustomUnit = !SALE_QUANTITY_UNITS.some((u) => u.value === selectedUnit);
              return (
                <div key={row.id} className="space-y-1">
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      placeholder={isHindi ? 'सामान का नाम' : 'Item Name'}
                      value={row.name}
                      onChange={(e) => updateRow(idx, { name: e.target.value })}
                      aria-label="Item Name"
                      className="col-span-12 sm:col-span-4 px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white placeholder:text-slate-400/55 focus:outline-none focus:border-cyan-400"
                    />
                    <div className="col-span-12 sm:col-span-4 flex items-center gap-2 min-w-0">
                      <input
                        type="text"
                        inputMode="text"
                        placeholder={
                          isHindi ? 'मात्रा (जैसे 2, आधा किलो)' : 'Qty (e.g. 2, 2 box)'
                        }
                        value={row.quantityText}
                        onChange={(e) => updateRow(idx, { quantityText: e.target.value })}
                        aria-label="Quantity"
                        className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white placeholder:text-slate-400/55 focus:outline-none focus:border-cyan-400"
                      />
                      <select
                        value={selectedUnit}
                        onChange={(e) => updateRow(idx, { unit: e.target.value })}
                        aria-label="Unit"
                        className="w-[104px] shrink-0 px-2.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-xs sm:text-sm text-cyan-200 focus:outline-none focus:border-cyan-400"
                      >
                        {SALE_QUANTITY_UNITS.map((unitOption) => (
                          <option key={unitOption.value} value={unitOption.value}>
                            {isHindi ? unitOption.labelHi : unitOption.labelEn}
                          </option>
                        ))}
                        {isCustomUnit ? (
                          <option value={selectedUnit}>{selectedUnit}</option>
                        ) : null}
                      </select>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={isHindi ? 'कीमत ₹' : 'Price ₹'}
                      value={row.priceText}
                      onChange={(e) => updateRow(idx, { priceText: e.target.value })}
                      aria-label="Price"
                      className={`col-span-6 sm:col-span-2 px-3 py-2.5 rounded-xl bg-[#0A142D] border text-sm text-white placeholder:text-slate-400/55 font-mono-num focus:outline-none focus:border-cyan-400 ${
                        row.barcode && !row.priceText.trim()
                          ? 'border-amber-400/70'
                          : 'border-blue-400/20'
                      }`}
                    />
                    <div className="col-span-4 sm:col-span-1 text-right font-mono-num text-sm text-cyan-300 truncate">
                      {formatINR(lineTotal)}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      aria-label="Remove item row"
                      className="col-span-2 sm:col-span-1 p-1.5 text-slate-400 hover:text-rose-400 flex items-center justify-center shrink-0"
                    >
                      <Trash2 className="w-4 h-4 shrink-0" />
                    </button>
                  </div>
                  {row.barcode &&
                  isPro &&
                  Number(row.priceText) > 0 &&
                  (!row.productId ||
                    row.isGlobalSuggestedPrice ||
                    row.priceText !== String(row.savedShopPrice ?? '') ||
                    row.name.trim() !== (row.savedShopName || '')) ? (
                    <div className="flex items-center justify-between gap-2 px-1">
                      {row.isGlobalSuggestedPrice ? (
                        <span className="text-[11px] text-cyan-300">
                          {isHindi
                            ? 'ग्लोबल सुझाया मूल्य — चाहें तो नाम/कीमत बदलकर सेव करें'
                            : 'Global suggested rate — edit name/price or save for your shop'}
                        </span>
                      ) : (
                        <span />
                      )}
                      <button
                        type="button"
                        disabled={savingPriceRowId === row.id}
                        onClick={() => void handleSaveScannedRowPrice(row)}
                        className="inline-flex items-center gap-1 text-[11px] text-emerald-300 hover:text-emerald-200"
                      >
                        <Check className="w-3 h-3" />
                        <span>
                          {savingPriceRowId === row.id
                            ? isHindi
                              ? 'सेव हो रहा है...'
                              : 'Saving...'
                            : isHindi
                              ? 'मेरी दुकान के लिए सेव करें'
                              : 'Save for My Shop'}
                        </span>
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="pt-4 border-t border-blue-400/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <label htmlFor="sale-discount" className="text-xs text-slate-300">
                {isHindi ? 'छूट (Discount ₹)' : 'Discount (₹)'}
              </label>
              <input
                id="sale-discount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={discountText}
                onChange={(e) => setDiscountText(e.target.value)}
                className="w-28 px-3 py-1.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white placeholder:text-slate-400/55 font-mono-num focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="text-right space-y-1">
              <div className="text-xs text-slate-400">
                {isHindi ? 'उप-कुल' : 'Subtotal'}:{' '}
                <span className="font-mono-num">{formatINR(totals.subtotal)}</span>
              </div>
              <div className="text-lg font-bold text-white font-mono-num">
                {isHindi ? 'कुल राशि' : 'Total'}: {formatINR(totals.finalTotal)}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/sales')}
            className="px-4 py-2.5 rounded-xl border border-blue-400/20 text-sm text-slate-300 hover:text-white"
          >
            {isHindi ? 'रद्द करें' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-semibold"
          >
            {submitting
              ? isHindi
                ? 'सेव हो रहा है...'
                : 'Saving...'
              : isHindi
                ? 'बिक्री सेव करें'
                : 'Save Sale'}
          </button>
        </div>
      </form>
    </AppLayout>
  );
}
