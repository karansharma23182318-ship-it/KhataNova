import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Barcode,
  CalendarClock,
  Camera,
  Check,
  Crown,
  Globe,
  Lock,
  Minus,
  PackagePlus,
  Pencil,
  Plus,
  ScanBarcode,
  Search,
  ShoppingBag,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { AppLayout } from '../../components/layout/AppLayout';
import { ProModeSwitch } from '../../components/common/ProModeSwitch';
import { BarcodeCameraScanner } from '../../components/scanner/BarcodeCameraScanner';
import { PLAN_CONFIG } from '../../config/planConfig';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  deleteNovaProduct,
  listNovaProducts,
  lookupBarcodeGlobal,
  saveNovaProduct,
  searchGlobalProducts,
} from '../../services/novaScanService';
import type { GlobalProduct, GlobalProductLookupResult, NovaProduct } from '../../types/models';
import { formatINR } from '../../utils/finance';
import { compressGalleryImageToDataUrl, isLikelyImageFile } from '../../utils/galleryImage';
import {
  DEFAULT_SCAN_COOLDOWN_MS,
  doPackSizesConflict,
  evaluateBatchExpiryStatus,
  isValidBarcode,
  normalizeBarcode,
  serializeNovaBillForNewSale,
  shouldIgnoreDuplicateScan,
  summarizeProductExpiryAlerts,
  upsertBillItemFromScan,
  type NovaScanBillLine,
} from '../../utils/novaScan';
import { playScanBeepSound } from '../../utils/scannerSound';

type NovaTab = 'scan' | 'catalog' | 'global';

export function NovaScan() {
  const { user, hasPremierAccess, isProMode, shopProfile } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();

  const shopId = shopProfile?.id || user?.uid;
  const isHindi = language === 'hi';
  const isPro = isProMode;

  const [activeTab, setActiveTab] = useState<NovaTab>('scan');
  const [products, setProducts] = useState<NovaProduct[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [barcodeInput, setBarcodeInput] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lastLookup, setLastLookup] = useState<GlobalProductLookupResult | null>(null);
  const [lastScanStatus, setLastScanStatus] = useState<string | null>(null);

  const [billItems, setBillItems] = useState<NovaScanBillLine[]>([]);
  const [savingPriceLineId, setSavingPriceLineId] = useState<string | null>(null);

  // Manual / Loose / Unbarcoded or Unknown-Barcode product form
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualBrand, setManualBrand] = useState('');
  const [manualPackSize, setManualPackSize] = useState('');
  const [manualCategories, setManualCategories] = useState('');
  const [manualImageUrl, setManualImageUrl] = useState('');
  const [manualUnit, setManualUnit] = useState('pcs');
  const [manualQty, setManualQty] = useState('1');
  const [manualPrice, setManualPrice] = useState('');
  const [manualBatchNo, setManualBatchNo] = useState('');
  const [manualExpiry, setManualExpiry] = useState('');
  const [savingManual, setSavingManual] = useState(false);

  // Batch Expiry modal/inline editor on catalog item
  const [batchTargetId, setBatchTargetId] = useState<string | null>(null);
  const [newBatchNo, setNewBatchNo] = useState('');
  const [newBatchExpiry, setNewBatchExpiry] = useState('');
  const [newBatchQty, setNewBatchQty] = useState('1');
  const [savingBatch, setSavingBatch] = useState(false);

  // Private shop catalog item editor (allows Shop B to customize name/price/photo privately or creator to update Global)
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editPackSize, setEditPackSize] = useState('');
  const [editCategories, setEditCategories] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editShareGlobalUpdate, setEditShareGlobalUpdate] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Global Catalog Search tab
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalProducts, setGlobalProducts] = useState<GlobalProduct[]>([]);
  const [loadingGlobalProducts, setLoadingGlobalProducts] = useState(false);
  const [globalPriceDrafts, setGlobalPriceDrafts] = useState<Record<string, string>>({});
  const [savingGlobalBarcode, setSavingGlobalBarcode] = useState<string | null>(null);

  const lastScanRef = useRef<{ barcode: string; timestampMs: number } | null>(null);
  const hidBufferRef = useRef<{ chars: string; lastKeyMs: number }>({ chars: '', lastKeyMs: 0 });
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!user || !shopId || !isPro) {
      setProducts([]);
      return;
    }
    let cancelled = false;
    setLoadingProducts(true);
    listNovaProducts(shopId)
      .then((list) => {
        if (!cancelled) setProducts(list);
      })
      .catch(console.warn)
      .finally(() => {
        if (!cancelled) setLoadingProducts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, shopId, isPro]);

  useEffect(() => {
    if (!user || !isPro || activeTab !== 'global') return;
    let cancelled = false;
    setLoadingGlobalProducts(true);
    const timer = window.setTimeout(() => {
      void searchGlobalProducts(globalSearchQuery)
        .then((list) => {
          if (!cancelled) setGlobalProducts(list);
        })
        .catch(console.warn)
        .finally(() => {
          if (!cancelled) setLoadingGlobalProducts(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [user, isPro, activeTab, globalSearchQuery]);

  const expiryAlerts = useMemo(() => summarizeProductExpiryAlerts(products), [products]);
  const expiredCount = useMemo(
    () => expiryAlerts.filter((a) => a.status === 'expired').length,
    [expiryAlerts]
  );
  const expiringSoonCount = useMemo(
    () => expiryAlerts.filter((a) => a.status === 'expiring_soon').length,
    [expiryAlerts]
  );

  const handleProcessBarcode = useCallback(
    async (rawCode: string, options: { bypassCooldown?: boolean } = {}) => {
      if (!user || !shopId || !isPro) return;
      const cleanCode = normalizeBarcode(rawCode);
      if (!isValidBarcode(cleanCode)) {
        setLookupError(
          isHindi
            ? 'अमान्य बारकोड। EAN-13, EAN-8, UPC-A, UPC-E या Code 128 स्कैन/दर्ज करें।'
            : 'Invalid barcode format. Please scan or enter EAN-13, EAN-8, UPC-A, UPC-E, or Code 128.'
        );
        return;
      }

      const nowMs = Date.now();
      if (
        !options.bypassCooldown &&
        shouldIgnoreDuplicateScan(lastScanRef.current, cleanCode, nowMs, DEFAULT_SCAN_COOLDOWN_MS)
      ) {
        return;
      }
      lastScanRef.current = { barcode: cleanCode, timestampMs: nowMs };

      setLookupLoading(true);
      setLookupError(null);
      setBarcodeInput(cleanCode);

      try {
        const result = await lookupBarcodeGlobal(cleanCode, shopId);
        setLastLookup(result);

        const localShopMatch =
          result.shopProduct ||
          products.find(
            (p) =>
              normalizeBarcode(p.barcode || '') === cleanCode &&
              !doPackSizesConflict(p.packSize, result.packSize)
          ) ||
          null;

        const resolvedName = localShopMatch?.name || result.productName;
        if (!result.found && !localShopMatch) {
          setLastScanStatus(
            isHindi
              ? `बारकोड ${cleanCode} ग्लोबल डेटाबेस में नहीं मिला — नीचे नाम, कीमत और फोटो जोड़कर सभी दुकानदारों के लिए सेव करें।`
              : `Barcode ${cleanCode} not found in Global DB — add name, price & photo below to save for your shop & global catalog.`
          );
          setManualBarcode(cleanCode);
          setManualName('');
          setManualBrand('');
          setManualPackSize('');
          setManualCategories('');
          setManualImageUrl('');
          setManualPrice('');
          setManualQty('1');
          setShowManualForm(true);
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

        setBillItems((prev) =>
          upsertBillItemFromScan(
            prev,
            {
              barcode: cleanCode,
              ...(localShopMatch?.id ? { productId: localShopMatch.id } : {}),
              name: resolvedName || cleanCode,
              brand: localShopMatch?.brand || result.brand,
              packSize: localShopMatch?.packSize || result.packSize,
              categories: localShopMatch?.categories || result.categories,
              imageUrl: localShopMatch?.imageUrl || result.imageUrl,
              unit: localShopMatch?.unit || result.globalProduct?.unit || 'pcs',
              savedSellingPrice: savedPrice,
              suggestedSellingPrice: suggestedPrice,
              source: localShopMatch
                ? 'shop'
                : result.source === 'global'
                  ? 'global'
                  : 'openfoodfacts',
            },
            nowMs
          )
        );

        playScanBeepSound();
        setLastScanStatus(
          isHindi
            ? `पहचाना गया: ${resolvedName || cleanCode} (${cleanCode})${
                suggestedPrice ? ` · ग्लोबल सुझाया मूल्य ₹${suggestedPrice}` : ''
              }`
            : `Recognized: ${resolvedName || cleanCode} (${cleanCode})${
                suggestedPrice ? ` · Global Suggested ₹${suggestedPrice}` : ''
              }`
        );
      } catch (err) {
        setLookupError(
          err instanceof Error
            ? err.message
            : isHindi
              ? 'प्रोडक्ट खोजने में समस्या आई। कृपया मैनुअल एंट्री का उपयोग करें।'
              : 'Unable to look up barcode product. You can add it manually.'
        );
      } finally {
        setLookupLoading(false);
      }
    },
    [user, shopId, isPro, isHindi, products]
  );

  // Global HID USB/Bluetooth Barcode Scanner Listener
  useEffect(() => {
    if (!isPro || activeTab !== 'scan') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      // Ignore typing inside regular inputs/textareas/selects except the dedicated barcode input
      if (
        (tag === 'input' || tag === 'textarea' || tag === 'select') &&
        target !== barcodeInputRef.current
      ) {
        return;
      }
      if (target === barcodeInputRef.current) {
        return; // Let dedicated input form handle Enter directly
      }

      const now = Date.now();
      const buf = hidBufferRef.current;

      if (e.key === 'Enter') {
        if (buf.chars.length >= 4 && now - buf.lastKeyMs < 250) {
          e.preventDefault();
          const scanned = buf.chars;
          hidBufferRef.current = { chars: '', lastKeyMs: 0 };
          void handleProcessBarcode(scanned, { bypassCooldown: true });
        } else {
          hidBufferRef.current = { chars: '', lastKeyMs: 0 };
        }
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (now - buf.lastKeyMs > 85) {
          buf.chars = e.key;
        } else {
          buf.chars += e.key;
        }
        buf.lastKeyMs = now;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPro, activeTab, handleProcessBarcode]);

  const handleSavePriceForItem = async (item: NovaScanBillLine) => {
    if (!shopId || item.sellingPrice === null || item.sellingPrice < 0) return;
    const cleanName = item.name.trim();
    if (!cleanName) return;
    setSavingPriceLineId(item.lineId);
    setLookupError(null);
    try {
      const res = await saveNovaProduct(shopId, {
        ...(item.productId ? { id: item.productId } : {}),
        ...(item.barcode ? { barcode: item.barcode } : {}),
        name: cleanName,
        ...(item.brand ? { brand: item.brand } : {}),
        ...(item.packSize ? { packSize: item.packSize } : {}),
        ...(item.categories ? { categories: item.categories } : {}),
        ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
        unit: item.unit,
        sellingPrice: item.sellingPrice,
        source:
          item.source === 'manual'
            ? 'manual'
            : item.source === 'global'
              ? 'global'
              : 'openfoodfacts',
      });
      setProducts(res.products);
      setBillItems((prev) =>
        prev.map((row) =>
          row.lineId === item.lineId
            ? {
                ...row,
                productId: res.product.id,
                name: res.product.name,
                priceConfirmed: true,
                hasSavedPrice: true,
                isGlobalSuggestedPrice: false,
              }
            : row
        )
      );
      setLastScanStatus(
        res.variantMismatch
          ? isHindi
            ? `${res.product.name} (₹${item.sellingPrice}) आपकी दुकान में सेव हो गया। (ग्लोबल डेटाबेस में अलग पैक साइज सुरक्षित रहा)`
            : `Saved ${res.product.name} (₹${item.sellingPrice}) for your shop only (Global catalog variant kept intact).`
          : isHindi
            ? `${res.product.name} की दुकान कीमत ₹${item.sellingPrice} सेव हो गई।`
            : `Saved ${res.product.name} at ₹${item.sellingPrice} for your shop.`
      );
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Unable to save selling price.');
    } finally {
      setSavingPriceLineId(null);
    }
  };

  const handleManualPhotoUpload = async (file: File | undefined) => {
    if (!file) return;
    if (!isLikelyImageFile(file)) {
      setLookupError(
        isHindi ? 'कृपया केवल फोटो (JPG/PNG/WebP) चुनें।' : 'Please choose a valid image file.'
      );
      return;
    }
    try {
      const dataUrl = await compressGalleryImageToDataUrl(file);
      setManualImageUrl(dataUrl);
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Could not load image.');
    }
  };

  const handleAddManualItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopId) return;
    const cleanName = manualName.trim();
    const qty = Math.max(0.01, Number(manualQty) || 1);
    const price = Number(manualPrice);
    if (!cleanName || !Number.isFinite(price) || price < 0) {
      setLookupError(
        isHindi
          ? 'कृपया सामान का नाम और सही बिक्री मूल्य (₹) दर्ज करें।'
          : 'Please enter a valid product name and selling price (₹).'
      );
      return;
    }

    setSavingManual(true);
    setLookupError(null);
    try {
      const cleanBarcode = normalizeBarcode(manualBarcode);
      const batches =
        manualBatchNo.trim() || manualExpiry.trim()
          ? [
              {
                batchNumber: manualBatchNo.trim() || 'Batch-1',
                expiryDate: manualExpiry.trim(),
                quantity: qty,
              },
            ]
          : undefined;

      const res = await saveNovaProduct(shopId, {
        ...(cleanBarcode ? { barcode: cleanBarcode } : {}),
        name: cleanName,
        ...(manualBrand.trim() ? { brand: manualBrand.trim() } : {}),
        ...(manualPackSize.trim() ? { packSize: manualPackSize.trim() } : {}),
        ...(manualCategories.trim() ? { categories: manualCategories.trim() } : {}),
        ...(manualImageUrl ? { imageUrl: manualImageUrl } : {}),
        unit: manualUnit,
        sellingPrice: price,
        source: 'manual',
        ...(batches ? { batches } : {}),
      });
      setProducts(res.products);

      setBillItems((prev) => [
        {
          lineId: `manual-${Date.now()}`,
          ...(cleanBarcode ? { barcode: cleanBarcode } : {}),
          productId: res.product.id,
          name: res.product.name,
          ...(res.product.brand ? { brand: res.product.brand } : {}),
          ...(res.product.packSize ? { packSize: res.product.packSize } : {}),
          ...(res.product.categories ? { categories: res.product.categories } : {}),
          ...(res.product.imageUrl ? { imageUrl: res.product.imageUrl } : {}),
          unit: res.product.unit,
          quantity: qty,
          sellingPrice: price,
          priceConfirmed: true,
          hasSavedPrice: true,
          isGlobalSuggestedPrice: false,
          source: 'manual',
          lastScannedAtMs: Date.now(),
        },
        ...prev,
      ]);

      setLastScanStatus(
        cleanBarcode
          ? isHindi
            ? `${res.product.name} (${cleanBarcode}) आपकी दुकान व ग्लोबल डेटाबेस में सेव हो गया।`
            : `Saved ${res.product.name} (${cleanBarcode}) to your shop & Global Product DB.`
          : isHindi
            ? `${res.product.name} आपकी दुकान में सेव हो गया।`
            : `Saved ${res.product.name} to your shop.`
      );

      setManualBarcode('');
      setManualName('');
      setManualBrand('');
      setManualPackSize('');
      setManualCategories('');
      setManualImageUrl('');
      setManualQty('1');
      setManualPrice('');
      setManualBatchNo('');
      setManualExpiry('');
      setShowManualForm(false);
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Unable to save manual product.');
    } finally {
      setSavingManual(false);
    }
  };

  const handleSaveCatalogEdit = async (prod: NovaProduct) => {
    if (!shopId) return;
    const cleanName = editName.trim();
    const parsedPrice = editPrice.trim() === '' ? undefined : Number(editPrice);
    if (!cleanName || (parsedPrice !== undefined && (!Number.isFinite(parsedPrice) || parsedPrice < 0))) {
      setLookupError(
        isHindi ? 'सही नाम और कीमत (₹) दर्ज करें।' : 'Please enter valid name and price (₹).'
      );
      return;
    }
    setSavingEdit(true);
    setLookupError(null);
    try {
      const res = await saveNovaProduct(shopId, {
        id: prod.id,
        barcode: prod.barcode,
        name: cleanName,
        brand: prod.brand,
        packSize: editPackSize.trim() || undefined,
        categories: editCategories.trim() || undefined,
        imageUrl: editImageUrl || undefined,
        unit: prod.unit,
        ...(parsedPrice !== undefined ? { sellingPrice: parsedPrice } : {}),
        source: prod.source,
        allowGlobalUpdate: editShareGlobalUpdate,
        batches: prod.batches,
      });
      setProducts(res.products);
      setEditTargetId(null);
      setEditShareGlobalUpdate(false);
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Failed to update product.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSaveGlobalCatalogShopPrice = async (gp: GlobalProduct) => {
    if (!shopId) return;
    const rawDraft = globalPriceDrafts[gp.barcode];
    const parsedPrice =
      rawDraft !== undefined && rawDraft.trim() !== ''
        ? Number(rawDraft)
        : typeof gp.suggestedPrice === 'number'
          ? gp.suggestedPrice
          : NaN;
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setLookupError(
        isHindi
          ? 'कृपया अपनी दुकान के लिए सही बिक्री मूल्य (₹) दर्ज करें।'
          : 'Please enter a valid shop selling price (₹).'
      );
      return;
    }
    setSavingGlobalBarcode(gp.barcode);
    setLookupError(null);
    try {
      const existingShop = products.find(
        (p) =>
          normalizeBarcode(p.barcode || '') === normalizeBarcode(gp.barcode) &&
          !doPackSizesConflict(p.packSize, gp.packSize)
      );
      const res = await saveNovaProduct(shopId, {
        ...(existingShop?.id ? { id: existingShop.id } : {}),
        barcode: gp.barcode,
        name: existingShop?.name || gp.name,
        brand: gp.brand,
        packSize: gp.packSize,
        categories: gp.categories,
        imageUrl: gp.imageUrl,
        unit: gp.unit || 'pcs',
        sellingPrice: parsedPrice,
        source: 'global',
      });
      setProducts(res.products);
      setLastScanStatus(
        isHindi
          ? `${gp.name} की आपकी दुकान की कीमत ₹${parsedPrice} सेव हो गई।`
          : `Saved your private shop price ₹${parsedPrice} for ${gp.name}.`
      );
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Unable to save shop price.');
    } finally {
      setSavingGlobalBarcode(null);
    }
  };

  const handleAddBatchToProduct = async (product: NovaProduct) => {
    if (!shopId) return;
    if (!newBatchNo.trim() && !newBatchExpiry.trim()) return;
    setSavingBatch(true);
    setLookupError(null);
    try {
      const updatedBatches = [
        ...product.batches,
        {
          batchNumber: newBatchNo.trim() || `Batch-${product.batches.length + 1}`,
          expiryDate: newBatchExpiry.trim(),
          quantity: Math.max(0, Number(newBatchQty) || 0),
        },
      ];
      const res = await saveNovaProduct(shopId, {
        id: product.id,
        barcode: product.barcode,
        name: product.name,
        brand: product.brand,
        packSize: product.packSize,
        categories: product.categories,
        imageUrl: product.imageUrl,
        unit: product.unit,
        sellingPrice: product.sellingPrice,
        source: product.source,
        batches: updatedBatches,
      });
      setProducts(res.products);
      setBatchTargetId(null);
      setNewBatchNo('');
      setNewBatchExpiry('');
      setNewBatchQty('1');
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Unable to save batch expiry.');
    } finally {
      setSavingBatch(false);
    }
  };

  const handleRemoveBatch = async (product: NovaProduct, batchId: string) => {
    if (!shopId) return;
    const res = await saveNovaProduct(shopId, {
      id: product.id,
      barcode: product.barcode,
      name: product.name,
      unit: product.unit,
      sellingPrice: product.sellingPrice,
      source: product.source,
      batches: product.batches.filter((b) => b.id !== batchId),
    });
    setProducts(res.products);
  };

  const billSummary = useMemo(() => {
    let total = 0;
    let missingPriceCount = 0;
    for (const item of billItems) {
      if (item.sellingPrice === null || !Number.isFinite(item.sellingPrice)) {
        missingPriceCount += 1;
      } else {
        total += item.quantity * item.sellingPrice;
      }
    }
    return {
      total: Math.round((total + Number.EPSILON) * 100) / 100,
      missingPriceCount,
    };
  }, [billItems]);

  const handleProceedToBilling = () => {
    if (billItems.length === 0) return;
    if (billSummary.missingPriceCount > 0) {
      setLookupError(
        isHindi
          ? 'कृपया बिल पर जाने से पहले सभी स्कैन किए गए सामान की बिक्री कीमत (₹) दर्ज करें।'
          : 'Please enter the selling price (₹) for every scanned item before proceeding to checkout.'
      );
      return;
    }
    const preloadedItems = serializeNovaBillForNewSale(billItems);
    navigate('/sales/new', { state: { preloadedItems } });
  };

  const filteredCatalog = useMemo(() => {
    if (!catalogSearch.trim()) return products;
    const q = catalogSearch.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q) ||
        (p.brand || '').toLowerCase().includes(q)
    );
  }, [products, catalogSearch]);

  // --- PRO GATE FOR NON-PRO / FREE USERS ---
  if (!isPro) {
    const proFeatures = isHindi ? PLAN_CONFIG.premium.featuresHi : PLAN_CONFIG.premium.featuresEn;
    return (
      <AppLayout title="Nova Scan">
        <div className="max-w-3xl space-y-6">
          <div className="glass-surface-elevated rounded-2xl p-6 border border-amber-400/35 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-center shrink-0 text-amber-300">
                  <ScanBarcode className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-white font-display">
                      Nova Scan – {isHindi ? 'ग्लोबल प्रोडक्ट पहचान' : 'Global Product Recognition'}
                    </h2>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/40 text-[10px] font-bold uppercase tracking-wider text-amber-200">
                      <Lock className="w-3 h-3" />
                      <span>PRO ONLY</span>
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {isHindi
                      ? 'कैमरा या USB/Bluetooth स्कैनर से सेकंडों में बारकोड स्कैन करें, ग्लोबल कैटलॉग से सामान पहचानें, अपनी दुकान की बिक्री कीमत जोड़ें, बैच एक्सपायरी ट्रैक करें और सीधे बिल बनाएं।'
                      : 'Scan product barcodes with your phone camera or USB/Bluetooth scanner, recognize items via Open Food Facts, use your shop selling prices, track batch expiry dates, and build bills instantly.'}
                  </p>
                </div>
              </div>
            </div>

            {hasPremierAccess ? (
              <div className="space-y-3">
                <p className="text-xs text-cyan-200">
                  {isHindi
                    ? 'आपका Lifetime Premier प्लान पहले से अनलॉक है। Nova Scan इस्तेमाल करने के लिए बस नीचे Pro मोड चालू करें:'
                    : 'Your Lifetime Premier access is already active. Turn Pro Mode ON below to unlock Nova Scan with zero extra payment:'}
                </p>
                <ProModeSwitch variant="card" />
              </div>
            ) : (
              <div className="space-y-4">
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-200">
                  {proFeatures.map((feat) => (
                    <li key={feat} className="flex items-start gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => navigate('/premium/pay')}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-sm font-bold"
                  >
                    <Crown className="w-4 h-4" />
                    <span>
                      {isHindi
                        ? 'Lifetime Pro अनलॉक करें (₹199)'
                        : 'Upgrade to Lifetime Pro (₹199)'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/premium')}
                    className="px-4 py-2.5 rounded-xl border border-blue-400/25 text-xs font-medium text-slate-200 hover:text-white"
                  >
                    {isHindi ? 'प्लान तुलना देखें' : 'Compare Plans'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Nova Scan">
      <div className="space-y-5">
        {/* Top Bar & Expiry Alert Summary */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 p-1 rounded-xl bg-[#0A132A] border border-amber-400/25">
            <button
              type="button"
              onClick={() => setActiveTab('scan')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'scan'
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <ScanBarcode className="w-3.5 h-3.5" />
              <span>{isHindi ? 'स्कैन और बिल' : 'Scan & Bill'}</span>
              {billItems.length > 0 ? (
                <span className="px-1.5 py-0.2 rounded bg-black/25 font-mono-num">
                  {billItems.length}
                </span>
              ) : null}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('catalog')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'catalog'
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <CalendarClock className="w-3.5 h-3.5" />
              <span>{isHindi ? 'प्रोडक्ट व एक्सपायरी' : 'Products & Expiry'}</span>
              {expiryAlerts.length > 0 ? (
                <span className="px-1.5 py-0.2 rounded bg-rose-500 text-white font-mono-num">
                  {expiryAlerts.length}
                </span>
              ) : null}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('global')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'global'
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{isHindi ? 'ग्लोबल कैटलॉग' : 'Global Catalog'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setActiveTab('scan');
              setShowManualForm((prev) => !prev);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-cyan-400/30 text-cyan-200 text-xs font-semibold"
          >
            <PackagePlus className="w-4 h-4" />
            <span>{isHindi ? 'खुला / मैनुअल सामान जोड़ें' : 'Add Loose / Manual Item'}</span>
          </button>
        </div>

        {(expiredCount > 0 || expiringSoonCount > 0) && activeTab === 'scan' ? (
          <button
            type="button"
            onClick={() => setActiveTab('catalog')}
            className="w-full text-left rounded-xl px-4 py-2.5 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-400/35 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-100"
          >
            <span className="inline-flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
              <span>
                {isHindi
                  ? `बैच एक्सपायरी चेतावनी: ${expiredCount} एक्सपायर्ड, ${expiringSoonCount} जल्द एक्सपायर होने वाले बैच`
                  : `Batch Expiry Alert: ${expiredCount} expired, ${expiringSoonCount} expiring within 30 days`}
              </span>
            </span>
            <span className="text-amber-300 font-semibold">
              {isHindi ? 'देखें →' : 'View Batches →'}
            </span>
          </button>
        ) : null}

        {lookupError ? (
          <div
            role="alert"
            className="rounded-xl px-4 py-3 bg-rose-500/10 border border-rose-400/35 flex items-center justify-between gap-3 text-xs text-rose-200"
          >
            <span>{lookupError}</span>
            <button
              type="button"
              onClick={() => setLookupError(null)}
              aria-label="Dismiss error"
              className="text-rose-200 hover:text-white px-1.5"
            >
              ×
            </button>
          </div>
        ) : null}

        {activeTab === 'scan' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* LEFT: Camera + USB/Bluetooth Barcode Input + Manual Form */}
            <div className="lg:col-span-6 space-y-4">
              <BarcodeCameraScanner
                isHindi={isHindi}
                isPro={isPro}
                onBarcodeDetected={(code) => void handleProcessBarcode(code)}
                lastScanLabel={lastScanStatus}
              />

              {/* USB / Bluetooth Scanner & Manual Barcode Box */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleProcessBarcode(barcodeInput, { bypassCooldown: true });
                }}
                className="pro-card rounded-2xl p-4 space-y-3 border border-amber-400/30"
              >
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="nova-barcode-input"
                    className="inline-flex items-center gap-2 text-xs font-semibold text-white"
                  >
                    <Barcode className="w-4 h-4 text-amber-300" />
                    <span>
                      {isHindi
                        ? 'USB / Bluetooth स्कैनर या बारकोड नंबर'
                        : 'USB / Bluetooth Scanner or Barcode'}
                    </span>
                  </label>
                  <span className="text-[10px] text-slate-400">
                    {isHindi ? 'ऑटो HID स्कैन चालू' : 'Auto HID ready'}
                  </span>
                </div>

                <div className="flex gap-2">
                  <input
                    id="nova-barcode-input"
                    ref={barcodeInputRef}
                    type="text"
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    placeholder={
                      isHindi
                        ? 'बारकोड स्कैन करें या लिखें (जैसे 8909106046351)'
                        : 'Scan or enter barcode (e.g. 8909106046351)'
                    }
                    className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-[#091228] border border-blue-400/25 text-sm text-white font-mono-num placeholder:font-sans placeholder:text-slate-400/60 focus:outline-none focus:border-amber-400"
                  />
                  <button
                    type="submit"
                    disabled={lookupLoading || !barcodeInput.trim()}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold whitespace-nowrap shrink-0"
                  >
                    {lookupLoading
                      ? isHindi
                        ? 'खोज रहा है...'
                        : 'Looking up...'
                      : isHindi
                        ? 'खोजें व जोड़ें'
                        : 'Scan / Add'}
                  </button>
                </div>
              </form>

              {/* Last Recognized Global Product Preview */}
              {lastLookup ? (
                <div className="pro-card rounded-3xl p-4 flex items-center gap-3.5 border border-cyan-400/25">
                  {lastLookup.imageUrl ? (
                    <img
                      src={lastLookup.imageUrl}
                      alt={lastLookup.productName || lastLookup.barcode}
                      className="w-16 h-16 rounded-2xl object-contain bg-white/95 p-1 shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-[#0A142D] border border-blue-400/20 flex items-center justify-center shrink-0 text-slate-400">
                      <ShoppingBag className="w-6 h-6" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-white truncate">
                        {lastLookup.shopProduct?.name ||
                          lastLookup.productName ||
                          (isHindi ? 'अज्ञात उत्पाद' : 'Product Not in Catalog')}
                      </span>
                      <span className="text-[10px] font-mono-num px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-400/30 text-cyan-200">
                        {lastLookup.found
                          ? lastLookup.source === 'global'
                            ? isHindi
                              ? 'Global DB'
                              : 'Global DB'
                            : lastLookup.source === 'shop'
                              ? isHindi
                                ? 'आपकी दुकान'
                                : 'Your Shop'
                              : lastLookup.cached
                                ? 'Cached'
                                : 'Open Food Facts'
                          : 'Not Found'}
                      </span>
                      {typeof lastLookup.suggestedPrice === 'number' &&
                      lastLookup.suggestedPrice > 0 ? (
                        <span className="text-[10px] font-mono-num px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-200">
                          {isHindi
                            ? `ग्लोबल ₹${lastLookup.suggestedPrice}`
                            : `Global ₹${lastLookup.suggestedPrice}`}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-slate-300 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span className="font-mono-num text-slate-400">{lastLookup.barcode}</span>
                      {lastLookup.brand ? <span>{lastLookup.brand}</span> : null}
                      {lastLookup.packSize ? <span>{lastLookup.packSize}</span> : null}
                      {lastLookup.categories ? (
                        <span className="text-cyan-300">{lastLookup.categories}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Manual / Loose / Unbarcoded Product Entry */}
              {showManualForm ? (
                <form
                  onSubmit={(e) => void handleAddManualItem(e)}
                  className="pro-card rounded-2xl p-4 space-y-3 border border-cyan-400/35"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white font-display">
                      {isHindi
                        ? 'मैनुअल / खुला सामान जोड़ें'
                        : 'Manual / Unbarcoded Product Entry'}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowManualForm(false)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      {isHindi ? 'बंद करें' : 'Close'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="sm:col-span-2">
                      <label className="block text-slate-300 mb-1">
                        {isHindi ? 'सामान का नाम *' : 'Product Name *'}
                      </label>
                      <input
                        type="text"
                        required
                        value={manualName}
                        onChange={(e) => setManualName(e.target.value)}
                        placeholder={isHindi ? 'जैसे: खुला चावल, बासमती या साबुन' : 'e.g. Loose Rice or Soap'}
                        className="w-full px-3 py-2 rounded-xl bg-[#091228] border border-blue-400/20 text-sm text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 mb-1">
                        {isHindi ? 'बिक्री मूल्य (₹) *' : 'Shop Selling Price (₹) *'}
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={manualPrice}
                        onChange={(e) => setManualPrice(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-3 py-2 rounded-xl bg-[#091228] border border-blue-400/20 text-sm text-white font-mono-num"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-slate-300 mb-1">
                          {isHindi ? 'मात्रा *' : 'Qty *'}
                        </label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          required
                          value={manualQty}
                          onChange={(e) => setManualQty(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-[#091228] border border-blue-400/20 text-sm text-white font-mono-num"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-300 mb-1">
                          {isHindi ? 'इकाई' : 'Unit'}
                        </label>
                        <select
                          value={manualUnit}
                          onChange={(e) => setManualUnit(e.target.value)}
                          className="w-full px-2.5 py-2 rounded-xl bg-[#091228] border border-blue-400/20 text-sm text-white"
                        >
                          <option value="pcs">pcs</option>
                          <option value="kg">kg</option>
                          <option value="gm">gm</option>
                          <option value="litre">litre</option>
                          <option value="pack">pack</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-300 mb-1">
                        {isHindi ? 'बारकोड (वैकल्पिक)' : 'Barcode (Optional)'}
                      </label>
                      <input
                        type="text"
                        value={manualBarcode}
                        onChange={(e) => setManualBarcode(e.target.value)}
                        placeholder="EAN / UPC / Code 128"
                        className="w-full px-3 py-2 rounded-xl bg-[#091228] border border-blue-400/20 text-sm text-white font-mono-num"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 mb-1">
                        {isHindi ? 'ब्रांड (वैकल्पिक)' : 'Brand (Optional)'}
                      </label>
                      <input
                        type="text"
                        value={manualBrand}
                        onChange={(e) => setManualBrand(e.target.value)}
                        placeholder={isHindi ? 'जैसे: Parle / Amul' : 'e.g. Parle / Amul'}
                        className="w-full px-3 py-2 rounded-xl bg-[#091228] border border-blue-400/20 text-sm text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 mb-1">
                        {isHindi ? 'पैक साइज (वैकल्पिक)' : 'Pack Size (Optional)'}
                      </label>
                      <input
                        type="text"
                        value={manualPackSize}
                        onChange={(e) => setManualPackSize(e.target.value)}
                        placeholder={isHindi ? 'जैसे: 100 g / 180 ml' : 'e.g. 100 g / 180 ml'}
                        className="w-full px-3 py-2 rounded-xl bg-[#091228] border border-blue-400/20 text-sm text-white"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-slate-300 mb-1">
                        {isHindi ? 'श्रेणी / कैटेगरी (वैकल्पिक)' : 'Category (Optional)'}
                      </label>
                      <input
                        type="text"
                        value={manualCategories}
                        onChange={(e) => setManualCategories(e.target.value)}
                        placeholder={isHindi ? 'जैसे: बिस्कुट, किराना, डेयरी' : 'e.g. Biscuits, Snacks, Dairy'}
                        className="w-full px-3 py-2 rounded-xl bg-[#091228] border border-blue-400/20 text-sm text-white"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-slate-300 mb-1">
                        {isHindi ? 'सामान की फोटो (वैकल्पिक — Global DB में सेव होगी)' : 'Product Photo (Optional — shared in Global DB)'}
                      </label>
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-blue-600/20 hover:bg-blue-600/30 border border-cyan-400/30 text-cyan-200 text-xs font-semibold cursor-pointer">
                          <Camera className="w-3.5 h-3.5" />
                          <span>{isHindi ? 'गैलरी से फोटो चुनें' : 'Choose Photo'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              void handleManualPhotoUpload(e.target.files?.[0]);
                              e.target.value = '';
                            }}
                          />
                        </label>
                        {manualImageUrl ? (
                          <div className="flex items-center gap-2">
                            <img
                              src={manualImageUrl}
                              alt="Product preview"
                              className="w-11 h-11 rounded-xl object-contain bg-white p-0.5 border border-cyan-400/30"
                            />
                            <button
                              type="button"
                              onClick={() => setManualImageUrl('')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-200 text-[11px]"
                            >
                              <X className="w-3 h-3" />
                              <span>{isHindi ? 'हटाएं' : 'Remove'}</span>
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-300 mb-1">
                        {isHindi ? 'बैच नंबर (पैकेट देखकर, वैकल्पिक)' : 'Batch No (Optional)'}
                      </label>
                      <input
                        type="text"
                        value={manualBatchNo}
                        onChange={(e) => setManualBatchNo(e.target.value)}
                        placeholder="e.g. B2611"
                        className="w-full px-3 py-2 rounded-xl bg-[#091228] border border-blue-400/20 text-sm text-white font-mono-num"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 mb-1">
                        {isHindi ? 'सत्यापित एक्सपायरी तारीख (वैकल्पिक)' : 'Verified Expiry Date (Optional)'}
                      </label>
                      <input
                        type="date"
                        value={manualExpiry}
                        onChange={(e) => setManualExpiry(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-[#091228] border border-blue-400/20 text-sm text-white font-mono-num"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={savingManual}
                    className="w-full py-2.5 rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-semibold"
                  >
                    {savingManual
                      ? isHindi
                        ? 'सेव हो रहा है...'
                        : 'Saving...'
                      : isHindi
                        ? 'बिल और दुकान लिस्ट में जोड़ें'
                        : 'Save & Add to Bill'}
                  </button>
                </form>
              ) : null}
            </div>

            {/* RIGHT: Current Nova Scan Bill */}
            <div className="lg:col-span-6 pro-card rounded-2xl p-5 space-y-4 border border-amber-400/35">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-amber-400/20">
                <div>
                  <h2 className="text-base font-bold text-white font-display">
                    {isHindi ? 'वर्तमान Nova Scan बिल' : 'Current Nova Scan Bill'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {isHindi
                      ? 'दोबारा स्कैन करने पर मात्रा अपने आप बढ़ेगी। बिक्री कीमत केवल आपकी दुकान के अनुसार तय होती है।'
                      : 'Re-scanning an item increments quantity. Selling price always uses your shop rate.'}
                  </p>
                </div>
                {billItems.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setBillItems([])}
                    className="text-xs text-slate-400 hover:text-rose-300"
                  >
                    {isHindi ? 'खाली करें' : 'Clear'}
                  </button>
                ) : null}
              </div>

              {billItems.length === 0 ? (
                <div className="py-10 text-center space-y-2 text-slate-400">
                  <ScanBarcode className="w-9 h-9 mx-auto text-amber-300/60" />
                  <p className="text-sm text-slate-200 font-medium">
                    {isHindi ? 'बिल शुरू करने के लिए कोई बारकोड स्कैन करें' : 'Scan any product barcode to start billing'}
                  </p>
                  <p className="text-xs">
                    {isHindi
                      ? 'या टेस्ट करने के लिए बारकोड 8909106046351 स्कैन/दर्ज करें।'
                      : 'Try scanning or entering barcode 8909106046351, or add a loose item manually.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                  {billItems.map((item) => {
                    const lineTotal =
                      item.sellingPrice !== null ? item.quantity * item.sellingPrice : null;
                    const needsPrice = item.sellingPrice === null || !item.priceConfirmed;

                    return (
                      <div
                        key={item.lineId}
                        className={`rounded-xl p-3.5 space-y-3 border ${
                          needsPrice
                            ? 'bg-amber-500/10 border-amber-400/45'
                            : 'bg-[#091228] border-blue-400/20'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-12 h-12 rounded-lg object-contain bg-white/95 p-0.5 shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-[#0D1A38] border border-blue-400/20 flex items-center justify-center shrink-0 text-slate-400">
                              <ShoppingBag className="w-5 h-5" />
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1 space-y-1">
                                <input
                                  type="text"
                                  value={item.name}
                                  aria-label={`Product name for ${item.barcode || item.lineId}`}
                                  onChange={(e) => {
                                    const nextName = e.target.value;
                                    setBillItems((prev) =>
                                      prev.map((r) =>
                                        r.lineId === item.lineId
                                          ? { ...r, name: nextName, hasSavedPrice: false }
                                          : r
                                      )
                                    );
                                  }}
                                  className="w-full px-2.5 py-1 rounded-lg bg-[#0D1A38] border border-blue-400/20 focus:border-cyan-400 text-sm font-semibold text-white focus:outline-none"
                                />
                                <div className="text-[11px] text-slate-400 flex flex-wrap gap-x-2">
                                  {item.brand ? <span>{item.brand}</span> : null}
                                  {item.packSize ? <span>{item.packSize}</span> : null}
                                  {item.barcode ? (
                                    <span className="font-mono-num">{item.barcode}</span>
                                  ) : null}
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  setBillItems((prev) =>
                                    prev.filter((r) => r.lineId !== item.lineId)
                                  )
                                }
                                aria-label={`Remove ${item.name}`}
                                className="p-1 text-slate-400 hover:text-rose-400"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-12 gap-2.5 items-end">
                          {/* Quantity controls */}
                          <div className="col-span-5 sm:col-span-4">
                            <div className="text-[10px] text-slate-400 mb-1">
                              {isHindi ? 'मात्रा' : 'Qty'} ({item.unit})
                            </div>
                            <div className="inline-flex items-center rounded-lg bg-[#0D1A38] border border-blue-400/25">
                              <button
                                type="button"
                                onClick={() =>
                                  setBillItems((prev) =>
                                    prev.map((r) =>
                                      r.lineId === item.lineId
                                        ? { ...r, quantity: Math.max(0.25, r.quantity - 1) }
                                        : r
                                    )
                                  )
                                }
                                aria-label={`Decrease quantity of ${item.name}`}
                                className="px-2 py-1.5 text-slate-300 hover:text-white"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={item.quantity}
                                aria-label={`Quantity for ${item.name}`}
                                onChange={(e) => {
                                  const qty = Math.max(0, Number(e.target.value) || 0);
                                  setBillItems((prev) =>
                                    prev.map((r) =>
                                      r.lineId === item.lineId ? { ...r, quantity: qty } : r
                                    )
                                  );
                                }}
                                className="w-12 text-center bg-transparent text-xs text-white font-mono-num focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setBillItems((prev) =>
                                    prev.map((r) =>
                                      r.lineId === item.lineId
                                        ? { ...r, quantity: r.quantity + 1 }
                                        : r
                                    )
                                  )
                                }
                                aria-label={`Increase quantity of ${item.name}`}
                                className="px-2 py-1.5 text-slate-300 hover:text-white"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Selling Price input + Save Shop Price button */}
                          <div className="col-span-7 sm:col-span-5">
                            <label className="block text-[10px] text-slate-300 mb-1">
                              {needsPrice
                                ? isHindi
                                  ? 'दुकान बिक्री मूल्य दर्ज करें (₹) *'
                                  : 'Enter Shop Selling Price (₹) *'
                                : item.isGlobalSuggestedPrice
                                  ? isHindi
                                    ? `ग्लोबल सुझाया ₹${item.suggestedPrice} (अपनी कीमत सेव करें)`
                                    : `Global Suggested ₹${item.suggestedPrice} (Edit/Save)`
                                  : item.hasSavedPrice
                                    ? isHindi
                                      ? 'आपकी दुकान की कीमत (₹)'
                                      : 'Your Shop Price (₹)'
                                    : isHindi
                                      ? 'बिक्री मूल्य (₹)'
                                      : 'Selling Price (₹)'}
                            </label>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="₹ Price"
                                aria-label={`Selling price for ${item.name}`}
                                value={item.sellingPrice ?? ''}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  const num = raw === '' ? null : Math.max(0, Number(raw) || 0);
                                  setBillItems((prev) =>
                                    prev.map((r) =>
                                      r.lineId === item.lineId
                                        ? {
                                            ...r,
                                            sellingPrice: num,
                                            priceConfirmed: num !== null,
                                            isGlobalSuggestedPrice: false,
                                          }
                                        : r
                                    )
                                  );
                                }}
                                className="w-full min-w-0 px-2.5 py-1.5 rounded-lg bg-[#0D1A38] border border-amber-400/35 text-xs text-white font-mono-num focus:outline-none focus:border-amber-300"
                              />
                              <button
                                type="button"
                                disabled={
                                  savingPriceLineId === item.lineId ||
                                  item.sellingPrice === null ||
                                  !item.name.trim()
                                }
                                onClick={() => void handleSavePriceForItem(item)}
                                title={
                                  isHindi
                                    ? 'केवल आपकी दुकान के लिए नाम व कीमत सेव करें'
                                    : 'Save custom name & selling price for your shop'
                                }
                                className="px-2.5 py-1.5 rounded-full bg-emerald-600/25 hover:bg-emerald-600/40 disabled:opacity-40 border border-emerald-400/35 text-emerald-200 text-[11px] font-medium whitespace-nowrap shrink-0"
                              >
                                <Check className="w-3.5 h-3.5 inline mr-0.5" />
                                <span>{isHindi ? 'सेव' : 'Save'}</span>
                              </button>
                            </div>
                          </div>

                          <div className="col-span-12 sm:col-span-3 text-right font-mono-num text-sm font-bold text-amber-300">
                            {lineTotal !== null ? formatINR(lineTotal) : '—'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="pt-4 border-t border-amber-400/20 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">
                    {isHindi ? 'बिल कुल (अनुमानित)' : 'Bill Subtotal'}
                  </span>
                  <span className="text-lg font-bold font-mono-num text-white">
                    {formatINR(billSummary.total)}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={billItems.length === 0}
                  onClick={handleProceedToBilling}
                  className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-45 text-slate-950 text-sm font-bold"
                >
                  <span>
                    {isHindi
                      ? 'बिल व पेमेंट पर आगे बढ़ें (Cash / UPI / Udhaar)'
                      : 'Proceed to Bill & Checkout (Cash / UPI / Udhaar)'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : activeTab === 'catalog' ? (
          /* CATALOG & BATCH-WISE EXPIRY TAB */
          <div className="space-y-5">
            {expiryAlerts.length > 0 ? (
              <div className="pro-card rounded-2xl p-4 space-y-3 border border-amber-400/35">
                <div className="flex items-center gap-2 text-sm font-bold text-amber-200 font-display">
                  <AlertTriangle className="w-4 h-4 text-amber-300" />
                  <span>
                    {isHindi
                      ? 'एक्सपायरी और जल्द एक्सपायर होने वाला स्टॉक'
                      : 'Expired & Soon-to-Expire Stock Warnings'}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {expiryAlerts.map((alert) => (
                    <div
                      key={alert.batchId}
                      className={`rounded-xl px-3.5 py-2.5 border text-xs flex items-center justify-between gap-3 ${
                        alert.status === 'expired'
                          ? 'bg-rose-500/10 border-rose-400/35 text-rose-100'
                          : 'bg-amber-500/10 border-amber-400/35 text-amber-100'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{alert.productName}</div>
                        <div className="text-[11px] opacity-85 font-mono-num">
                          {alert.batchNumber} · {alert.expiryDate} · Qty {alert.quantity}
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                          alert.status === 'expired'
                            ? 'bg-rose-500/25 text-rose-200'
                            : 'bg-amber-500/25 text-amber-200'
                        }`}
                      >
                        {alert.status === 'expired'
                          ? isHindi
                            ? 'एक्सपायर्ड'
                            : 'Expired'
                          : isHindi
                            ? `${alert.daysRemaining} दिन शेष`
                            : `${alert.daysRemaining}d left`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
              <div className="relative sm:w-96 w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder={
                    isHindi
                      ? 'सेव प्रोडक्ट, बारकोड या ब्रांड खोजें...'
                      : 'Search saved products, barcode, or brand...'
                  }
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#0D1A38] border border-blue-400/20 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <p className="text-[11px] text-slate-400">
                {isHindi
                  ? 'नोट: एक्सपायरी तारीख केवल पैकेट देखकर मैन्युअल बैच से दर्ज की जाती है।'
                  : 'Note: Expiry dates come only from verified package batch entries — never guessed from barcodes.'}
              </p>
            </div>

            {loadingProducts ? (
              <div className="pro-card rounded-2xl p-6 text-sm text-slate-400">Loading...</div>
            ) : filteredCatalog.length === 0 ? (
              <div className="pro-card rounded-2xl p-8 text-center space-y-2 text-slate-400">
                <ShoppingBag className="w-8 h-8 mx-auto text-amber-300/60" />
                <p className="text-sm text-white font-medium">
                  {isHindi ? 'अभी कोई सेव प्रोडक्ट या बैच नहीं है' : 'No saved Nova Scan products yet'}
                </p>
                <p className="text-xs">
                  {isHindi
                    ? 'कोई बारकोड स्कैन करके कीमत सेव करें या खुला सामान जोड़ें।'
                    : 'Scan a product and save its selling price or add a loose/manual item.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredCatalog.map((prod) => (
                  <div
                    key={prod.id}
                    className="pro-card rounded-2xl p-4 space-y-3 border border-amber-400/25"
                  >
                    <div className="flex items-start gap-3">
                      {prod.imageUrl ? (
                        <img
                          src={prod.imageUrl}
                          alt={prod.name}
                          className="w-14 h-14 rounded-xl object-contain bg-white/95 p-1 shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-[#0A142D] border border-blue-400/20 flex items-center justify-center shrink-0 text-slate-400">
                          <ShoppingBag className="w-5 h-5" />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-bold text-white truncate">{prod.name}</h3>
                          <span className="font-mono-num text-sm font-bold text-amber-300 shrink-0">
                            {typeof prod.sellingPrice === 'number'
                              ? formatINR(prod.sellingPrice)
                              : 'No Price'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 flex flex-wrap gap-x-2 mt-0.5">
                          {prod.barcode ? <span className="font-mono-num">{prod.barcode}</span> : null}
                          {prod.brand ? <span>{prod.brand}</span> : null}
                          {prod.packSize ? <span>{prod.packSize}</span> : null}
                          {prod.categories ? <span className="text-cyan-300">{prod.categories}</span> : null}
                          <span>· {prod.unit}</span>
                        </div>
                      </div>
                    </div>

                    {/* Batches List */}
                    {prod.batches.length > 0 ? (
                      <div className="space-y-1.5">
                        {prod.batches.map((b) => {
                          const status = evaluateBatchExpiryStatus(b.expiryDate);
                          return (
                            <div
                              key={b.id}
                              className="px-3 py-1.5 rounded-lg bg-[#091228] border border-blue-400/15 flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="min-w-0 font-mono-num">
                                <span className="text-white">{b.batchNumber}</span>
                                <span className="text-slate-400"> · Exp: {b.expiryDate || 'N/A'}</span>
                                <span className="text-slate-400"> · Qty: {b.quantity}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {status.status === 'expired' ? (
                                  <span className="text-[10px] font-bold text-rose-300 uppercase">
                                    Expired
                                  </span>
                                ) : status.status === 'expiring_soon' ? (
                                  <span className="text-[10px] font-bold text-amber-300 uppercase">
                                    {status.daysRemaining}d left
                                  </span>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => void handleRemoveBatch(prod, b.id)}
                                  aria-label={`Delete batch ${b.batchNumber}`}
                                  className="text-slate-400 hover:text-rose-400"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}

                    {/* Inline Edit Product (Private Shop Override) */}
                    {editTargetId === prod.id ? (
                      <div className="p-3 rounded-2xl bg-[#091228] border border-emerald-400/35 space-y-2.5 text-xs">
                        <div className="text-[11px] font-semibold text-emerald-200">
                          {isHindi
                            ? 'केवल आपकी दुकान के लिए नाम / कीमत बदलें'
                            : 'Edit Name, Price & Pack Size (Your Shop Only)'}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input
                            type="text"
                            placeholder={isHindi ? 'नाम' : 'Product Name'}
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="sm:col-span-2 px-2.5 py-1.5 rounded-xl bg-[#0D1A38] border border-blue-400/20 text-white"
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Price ₹"
                            value={editPrice}
                            onChange={(e) => setEditPrice(e.target.value)}
                            className="px-2.5 py-1.5 rounded-xl bg-[#0D1A38] border border-blue-400/20 text-white font-mono-num"
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            placeholder={isHindi ? 'पैक साइज (जैसे 100g)' : 'Pack Size'}
                            value={editPackSize}
                            onChange={(e) => setEditPackSize(e.target.value)}
                            className="px-2.5 py-1.5 rounded-xl bg-[#0D1A38] border border-blue-400/20 text-white"
                          />
                          <input
                            type="text"
                            placeholder={isHindi ? 'कैटेगरी (जैसे बिस्कुट)' : 'Category'}
                            value={editCategories}
                            onChange={(e) => setEditCategories(e.target.value)}
                            className="px-2.5 py-1.5 rounded-xl bg-[#0D1A38] border border-blue-400/20 text-white"
                          />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          {prod.barcode ? (
                            <label className="inline-flex items-center gap-1.5 text-[11px] text-cyan-200 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editShareGlobalUpdate}
                                onChange={(e) => setEditShareGlobalUpdate(e.target.checked)}
                                className="rounded border-cyan-400/40 bg-[#0D1A38]"
                              />
                              <span>
                                {isHindi
                                  ? 'साझा ग्लोबल डिटेल्स भी अपडेट करें'
                                  : 'Also update shared Global details'}
                              </span>
                            </label>
                          ) : (
                            <span />
                          )}
                          <label className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-blue-600/20 border border-cyan-400/30 text-cyan-200 cursor-pointer">
                            <Camera className="w-3.5 h-3.5" />
                            <span>{isHindi ? 'फोटो' : 'Photo'}</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={async (e) => {
                                const f = e.target.files?.[0];
                                e.target.value = '';
                                if (f && isLikelyImageFile(f)) {
                                  setEditImageUrl(await compressGalleryImageToDataUrl(f));
                                }
                              }}
                            />
                          </label>
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditTargetId(null)}
                            className="px-3 py-1 rounded-full text-slate-400 hover:text-white"
                          >
                            {isHindi ? 'रद्द' : 'Cancel'}
                          </button>
                          <button
                            type="button"
                            disabled={savingEdit}
                            onClick={() => void handleSaveCatalogEdit(prod)}
                            className="px-3.5 py-1 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                          >
                            {isHindi ? 'सेव करें' : 'Save Changes'}
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {/* Inline Add Batch Form */}
                    {batchTargetId === prod.id ? (
                      <div className="p-3 rounded-xl bg-[#091228] border border-cyan-400/30 space-y-2 text-xs">
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            type="text"
                            placeholder="Batch No"
                            value={newBatchNo}
                            onChange={(e) => setNewBatchNo(e.target.value)}
                            className="px-2.5 py-1.5 rounded-lg bg-[#0D1A38] border border-blue-400/20 text-white font-mono-num"
                          />
                          <input
                            type="date"
                            value={newBatchExpiry}
                            onChange={(e) => setNewBatchExpiry(e.target.value)}
                            className="px-2 py-1.5 rounded-lg bg-[#0D1A38] border border-blue-400/20 text-white font-mono-num"
                          />
                          <input
                            type="number"
                            min="0"
                            step="1"
                            placeholder="Qty"
                            value={newBatchQty}
                            onChange={(e) => setNewBatchQty(e.target.value)}
                            className="px-2.5 py-1.5 rounded-lg bg-[#0D1A38] border border-blue-400/20 text-white font-mono-num"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setBatchTargetId(null)}
                            className="px-2.5 py-1 rounded-lg text-slate-400 hover:text-white"
                          >
                            {isHindi ? 'रद्द' : 'Cancel'}
                          </button>
                          <button
                            type="button"
                            disabled={savingBatch}
                            onClick={() => void handleAddBatchToProduct(prod)}
                            className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold"
                          >
                            {isHindi ? 'बैच सेव करें' : 'Save Batch'}
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-blue-400/15 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setBillItems((prev) =>
                            upsertBillItemFromScan(
                              prev,
                              {
                                barcode: prod.barcode || '',
                                productId: prod.id,
                                name: prod.name,
                                brand: prod.brand,
                                packSize: prod.packSize,
                                categories: prod.categories,
                                imageUrl: prod.imageUrl,
                                unit: prod.unit,
                                savedSellingPrice: prod.sellingPrice,
                                source: 'shop',
                              },
                              Date.now()
                            )
                          );
                          setActiveTab('scan');
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/35 text-amber-200 font-medium"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{isHindi ? 'बिल में जोड़ें' : 'Add to Bill'}</span>
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditTargetId(editTargetId === prod.id ? null : prod.id);
                            setEditName(prod.name);
                            setEditPrice(
                              typeof prod.sellingPrice === 'number' ? String(prod.sellingPrice) : ''
                            );
                            setEditPackSize(prod.packSize || '');
                            setEditCategories(prod.categories || '');
                            setEditImageUrl(prod.imageUrl || '');
                            setEditShareGlobalUpdate(false);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-400/30 text-emerald-200"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>{isHindi ? 'बदलें' : 'Edit'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setBatchTargetId(prod.id);
                            setNewBatchNo('');
                            setNewBatchExpiry('');
                            setNewBatchQty('1');
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-blue-600/20 hover:bg-blue-600/30 border border-blue-400/25 text-cyan-200"
                        >
                          <CalendarClock className="w-3.5 h-3.5" />
                          <span>{isHindi ? '+ बैच' : '+ Batch'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            shopId && void deleteNovaProduct(shopId, prod.id).then(setProducts)
                          }
                          aria-label={`Delete ${prod.name}`}
                          className="p-1.5 text-slate-400 hover:text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* GLOBAL SHARED PRODUCT SEARCH TAB */
          <div className="space-y-5">
            <div className="pro-card rounded-2xl p-4 border border-cyan-400/30 space-y-3">
              <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
                <div className="relative sm:w-96 w-full">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={globalSearchQuery}
                    onChange={(e) => setGlobalSearchQuery(e.target.value)}
                    placeholder={
                      isHindi
                        ? 'ग्लोबल प्रोडक्ट खोजें (नाम, बारकोड, ब्रांड, कैटेगरी)...'
                        : 'Search Global Products (name, barcode, brand, category)...'
                    }
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#0D1A38] border border-blue-400/20 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <p className="text-[11px] text-cyan-200">
                  {isHindi
                    ? 'किसी भी दुकानदार द्वारा जोड़े गए सामान को खोजें और अपनी दुकान का निजी बिक्री मूल्य सेट करें।'
                    : 'Browse shared Global Products and set your own private shop price without affecting other shops.'}
                </p>
              </div>
            </div>

            {loadingGlobalProducts ? (
              <div className="pro-card rounded-2xl p-6 text-sm text-slate-400">
                {isHindi ? 'ग्लोबल कैटलॉग लोड हो रहा है...' : 'Loading Global Product Database...'}
              </div>
            ) : globalProducts.length === 0 ? (
              <div className="pro-card rounded-2xl p-8 text-center space-y-2 text-slate-400">
                <Globe className="w-8 h-8 mx-auto text-cyan-300/60" />
                <p className="text-sm text-white font-medium">
                  {isHindi ? 'कोई ग्लोबल प्रोडक्ट नहीं मिला' : 'No matching Global Products found'}
                </p>
                <p className="text-xs">
                  {isHindi
                    ? 'कोई बारकोड स्कैन या जोड़कर पहला साझा प्रोडक्ट सेव करें।'
                    : 'Scan or add a barcoded product to contribute it to the shared Global Database.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {globalProducts.map((gp) => {
                  const shopMatch =
                    products.find(
                      (p) =>
                        normalizeBarcode(p.barcode || '') === normalizeBarcode(gp.barcode) &&
                        !doPackSizesConflict(p.packSize, gp.packSize)
                    ) || null;
                  const draftValue =
                    globalPriceDrafts[gp.barcode] ??
                    (typeof shopMatch?.sellingPrice === 'number'
                      ? String(shopMatch.sellingPrice)
                      : typeof gp.suggestedPrice === 'number'
                        ? String(gp.suggestedPrice)
                        : '');

                  return (
                    <div
                      key={gp.barcode}
                      className="pro-card rounded-2xl p-4 space-y-3 border border-cyan-400/25"
                    >
                      <div className="flex items-start gap-3">
                        {gp.imageUrl ? (
                          <img
                            src={gp.imageUrl}
                            alt={gp.name}
                            className="w-14 h-14 rounded-xl object-contain bg-white/95 p-1 shrink-0"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-xl bg-[#0A142D] border border-blue-400/20 flex items-center justify-center shrink-0 text-slate-400">
                            <ShoppingBag className="w-5 h-5" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-sm font-bold text-white truncate">{gp.name}</h3>
                            {typeof gp.suggestedPrice === 'number' && gp.suggestedPrice > 0 ? (
                              <span className="text-[11px] font-mono-num px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 shrink-0">
                                {isHindi ? `सुझाया ₹${gp.suggestedPrice}` : `Global ₹${gp.suggestedPrice}`}
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs text-slate-400 flex flex-wrap gap-x-2">
                            <span className="font-mono-num">{gp.barcode}</span>
                            {gp.brand ? <span>{gp.brand}</span> : null}
                            {gp.packSize ? <span>{gp.packSize}</span> : null}
                            {gp.categories ? <span className="text-cyan-300">{gp.categories}</span> : null}
                          </div>
                          {shopMatch && typeof shopMatch.sellingPrice === 'number' ? (
                            <div className="text-[11px] text-amber-300 font-medium">
                              {isHindi
                                ? `आपकी दुकान की कीमत: ${formatINR(shopMatch.sellingPrice)}`
                                : `Your Shop Price: ${formatINR(shopMatch.sellingPrice)}`}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-blue-400/15">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder={isHindi ? 'अपनी कीमत ₹' : 'My Price ₹'}
                            aria-label={`Your shop price for ${gp.name}`}
                            value={draftValue}
                            onChange={(e) =>
                              setGlobalPriceDrafts((prev) => ({
                                ...prev,
                                [gp.barcode]: e.target.value,
                              }))
                            }
                            className="w-24 px-2.5 py-1.5 rounded-lg bg-[#0D1A38] border border-amber-400/35 text-xs text-white font-mono-num focus:outline-none focus:border-amber-300"
                          />
                          <button
                            type="button"
                            disabled={savingGlobalBarcode === gp.barcode}
                            onClick={() => void handleSaveGlobalCatalogShopPrice(gp)}
                            className="px-3 py-1.5 rounded-full bg-emerald-600/25 hover:bg-emerald-600/40 disabled:opacity-50 border border-emerald-400/35 text-emerald-200 text-[11px] font-medium whitespace-nowrap"
                          >
                            {savingGlobalBarcode === gp.barcode
                              ? isHindi
                                ? 'सेव...'
                                : 'Saving...'
                              : isHindi
                                ? 'मेरी कीमत सेव करें'
                                : 'Save Shop Price'}
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const savedPrice =
                              typeof shopMatch?.sellingPrice === 'number' &&
                              shopMatch.sellingPrice > 0
                                ? shopMatch.sellingPrice
                                : undefined;
                            const suggested =
                              !savedPrice &&
                              typeof gp.suggestedPrice === 'number' &&
                              gp.suggestedPrice > 0
                                ? gp.suggestedPrice
                                : undefined;
                            setBillItems((prev) =>
                              upsertBillItemFromScan(
                                prev,
                                {
                                  barcode: gp.barcode,
                                  ...(shopMatch?.id ? { productId: shopMatch.id } : {}),
                                  name: shopMatch?.name || gp.name,
                                  brand: shopMatch?.brand || gp.brand,
                                  packSize: shopMatch?.packSize || gp.packSize,
                                  categories: shopMatch?.categories || gp.categories,
                                  imageUrl: shopMatch?.imageUrl || gp.imageUrl,
                                  unit: shopMatch?.unit || gp.unit || 'pcs',
                                  savedSellingPrice: savedPrice,
                                  suggestedSellingPrice: suggested,
                                  source: shopMatch ? 'shop' : 'global',
                                },
                                Date.now()
                              )
                            );
                            setActiveTab('scan');
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/35 text-amber-200 text-xs font-medium"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{isHindi ? 'बिल में जोड़ें' : 'Add to Bill'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
