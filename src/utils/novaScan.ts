import type { GlobalProduct, NovaProduct, ProductBatch } from '../types/models';

export const OPEN_FOOD_FACTS_API_BASE = 'https://world.openfoodfacts.org/api/v3.6/product';
export const OPEN_FOOD_FACTS_FIELDS =
  'code,product_name,brands,quantity,categories,image_url,product_quantity';
export const KHATANOVA_OFF_USER_AGENT =
  'KhataNova/1.0 (https://khatanova.app; support@khatanova.app)';
export const EXPIRING_SOON_DAYS = 30;
export const DEFAULT_SCAN_COOLDOWN_MS = 1800;

export interface ParsedOpenFoodFactsProduct {
  found: boolean;
  barcode: string;
  productName?: string;
  brand?: string;
  packSize?: string;
  productQuantity?: string | number;
  categories?: string;
  imageUrl?: string;
}

export interface NovaScanBillLine {
  lineId: string;
  barcode?: string;
  productId?: string;
  name: string;
  brand?: string;
  packSize?: string;
  categories?: string;
  imageUrl?: string;
  unit: string;
  quantity: number;
  sellingPrice: number | null;
  suggestedPrice?: number;
  priceConfirmed: boolean;
  hasSavedPrice: boolean;
  isGlobalSuggestedPrice?: boolean;
  source: 'global' | 'openfoodfacts' | 'shop' | 'manual';
  lastScannedAtMs: number;
}

export type BatchExpiryStatus = 'expired' | 'expiring_soon' | 'valid' | 'unknown';

export interface BatchExpiryEvaluation {
  status: BatchExpiryStatus;
  daysRemaining: number | null;
}

export interface ProductExpiryAlert {
  productId: string;
  productName: string;
  barcode?: string;
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  status: 'expired' | 'expiring_soon';
  daysRemaining: number;
}

export function normalizeBarcode(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, '');
}

export function normalizePackSizeKey(packSize?: string | null): string {
  return String(packSize || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

export function doPackSizesConflict(a?: string | null, b?: string | null): boolean {
  const keyA = normalizePackSizeKey(a);
  const keyB = normalizePackSizeKey(b);
  if (!keyA || !keyB) return false;
  return keyA !== keyB;
}

/**
 * Produces a key safe for both Firestore doc IDs (`^[a-zA-Z0-9_\-]+$`) and Firebase RTDB keys.
 */
export function toSafeBarcodeDocId(rawBarcode: string): string {
  const clean = normalizeBarcode(rawBarcode);
  if (!clean) return 'empty';
  if (/^[a-zA-Z0-9_-]{1,120}$/.test(clean)) {
    return clean;
  }
  let hex = '';
  for (let i = 0; i < clean.length; i++) {
    hex += clean.charCodeAt(i).toString(16).padStart(4, '0');
  }
  return `bhex_${hex.slice(0, 118)}`;
}

/**
 * Supports EAN-13, EAN-8, UPC-A (12 digits), UPC-E (6-8 digits), and Code 128 (alphanumeric 2-64 chars).
 */
export function isValidBarcode(raw: string): boolean {
  const cleaned = normalizeBarcode(raw);
  if (!cleaned || cleaned.length < 4 || cleaned.length > 64) {
    return false;
  }
  // Printable ASCII without whitespace/control characters (covers EAN/UPC numeric & Code 128 ASCII)
  return /^[\x21-\x7E]{4,64}$/.test(cleaned);
}

export function buildOpenFoodFactsUrl(barcode: string): string {
  const clean = normalizeBarcode(barcode);
  return `${OPEN_FOOD_FACTS_API_BASE}/${encodeURIComponent(clean)}.json?fields=${OPEN_FOOD_FACTS_FIELDS}`;
}

export function parseOpenFoodFactsResponse(
  payload: unknown,
  requestedBarcode: string
): ParsedOpenFoodFactsProduct {
  const cleanCode = normalizeBarcode(requestedBarcode);
  if (!payload || typeof payload !== 'object') {
    return { found: false, barcode: cleanCode };
  }

  const obj = payload as Record<string, unknown>;
  const resultObj =
    obj.result && typeof obj.result === 'object'
      ? (obj.result as Record<string, unknown>)
      : null;

  if (
    obj.status === 'failure' ||
    obj.status === 0 ||
    resultObj?.id === 'product_not_found'
  ) {
    return { found: false, barcode: cleanCode };
  }

  const product =
    obj.product && typeof obj.product === 'object'
      ? (obj.product as Record<string, unknown>)
      : null;

  if (!product) {
    return { found: false, barcode: cleanCode };
  }

  const pickStr = (val: unknown): string | undefined => {
    if (typeof val !== 'string') return undefined;
    const trimmed = val.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };

  const productName = pickStr(product.product_name);
  const brand = pickStr(product.brands);
  const packSize = pickStr(product.quantity);
  const categories = pickStr(product.categories);
  const imageUrl = pickStr(product.image_url);
  const code = pickStr(product.code) || pickStr(obj.code) || cleanCode;

  let productQuantity: string | number | undefined;
  if (typeof product.product_quantity === 'number' && Number.isFinite(product.product_quantity)) {
    productQuantity = product.product_quantity;
  } else if (typeof product.product_quantity === 'string' && product.product_quantity.trim()) {
    productQuantity = product.product_quantity.trim();
  }

  // Only treat as found if Open Food Facts actually returned product details
  if (!productName && !brand && !packSize && !imageUrl && !categories) {
    return { found: false, barcode: code };
  }

  return {
    found: true,
    barcode: code,
    ...(productName ? { productName } : {}),
    ...(brand ? { brand } : {}),
    ...(packSize ? { packSize } : {}),
    ...(productQuantity !== undefined ? { productQuantity } : {}),
    ...(categories ? { categories } : {}),
    ...(imageUrl ? { imageUrl } : {}),
  };
}

export function shouldIgnoreDuplicateScan(
  lastScan: { barcode: string; timestampMs: number } | null,
  barcode: string,
  nowMs: number,
  cooldownMs = DEFAULT_SCAN_COOLDOWN_MS
): boolean {
  if (!lastScan) return false;
  const clean = normalizeBarcode(barcode);
  if (!clean || lastScan.barcode !== clean) return false;
  return nowMs - lastScan.timestampMs < cooldownMs;
}

export function upsertBillItemFromScan(
  currentItems: NovaScanBillLine[],
  scanned: {
    barcode: string;
    productId?: string;
    name: string;
    brand?: string;
    packSize?: string;
    categories?: string;
    imageUrl?: string;
    unit?: string;
    savedSellingPrice?: number;
    suggestedSellingPrice?: number;
    source: 'global' | 'openfoodfacts' | 'shop' | 'manual';
  },
  nowMs: number
): NovaScanBillLine[] {
  const cleanBarcode = normalizeBarcode(scanned.barcode);
  const existingIdx = currentItems.findIndex((item) => {
    if (scanned.productId && item.productId === scanned.productId) {
      return !doPackSizesConflict(item.packSize, scanned.packSize);
    }
    return Boolean(
      cleanBarcode &&
        item.barcode === cleanBarcode &&
        !doPackSizesConflict(item.packSize, scanned.packSize)
    );
  });

  if (existingIdx >= 0) {
    return currentItems.map((item, idx) =>
      idx === existingIdx
        ? {
            ...item,
            quantity: Math.round((item.quantity + 1) * 100) / 100,
            lastScannedAtMs: nowMs,
          }
        : item
    );
  }

  const hasSavedPrice =
    typeof scanned.savedSellingPrice === 'number' &&
    Number.isFinite(scanned.savedSellingPrice) &&
    scanned.savedSellingPrice > 0;

  const hasSuggestedPrice =
    !hasSavedPrice &&
    typeof scanned.suggestedSellingPrice === 'number' &&
    Number.isFinite(scanned.suggestedSellingPrice) &&
    scanned.suggestedSellingPrice > 0;

  const initialPrice = hasSavedPrice
    ? scanned.savedSellingPrice!
    : hasSuggestedPrice
      ? scanned.suggestedSellingPrice!
      : null;

  const newLine: NovaScanBillLine = {
    lineId: `scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ...(cleanBarcode ? { barcode: cleanBarcode } : {}),
    ...(scanned.productId ? { productId: scanned.productId } : {}),
    name: scanned.name.trim(),
    ...(scanned.brand ? { brand: scanned.brand } : {}),
    ...(scanned.packSize ? { packSize: scanned.packSize } : {}),
    ...(scanned.categories ? { categories: scanned.categories } : {}),
    ...(scanned.imageUrl ? { imageUrl: scanned.imageUrl } : {}),
    unit: scanned.unit?.trim() || 'pcs',
    quantity: 1,
    sellingPrice: initialPrice,
    ...(hasSuggestedPrice ? { suggestedPrice: scanned.suggestedSellingPrice } : {}),
    priceConfirmed: hasSavedPrice || hasSuggestedPrice,
    hasSavedPrice,
    isGlobalSuggestedPrice: hasSuggestedPrice,
    source: scanned.source,
    lastScannedAtMs: nowMs,
  };

  return [newLine, ...currentItems];
}

export function evaluateBatchExpiryStatus(
  expiryDateIso: string | undefined | null,
  referenceDate: Date = new Date(),
  soonWindowDays = EXPIRING_SOON_DAYS
): BatchExpiryEvaluation {
  const clean = (expiryDateIso || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return { status: 'unknown', daysRemaining: null };
  }

  const [y, m, d] = clean.split('-').map(Number);
  const expiryUtc = Date.UTC(y, m - 1, d);
  if (!Number.isFinite(expiryUtc)) {
    return { status: 'unknown', daysRemaining: null };
  }

  const todayUtc = Date.UTC(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  const daysRemaining = Math.round((expiryUtc - todayUtc) / (24 * 60 * 60 * 1000));

  if (daysRemaining < 0) {
    return { status: 'expired', daysRemaining };
  }
  if (daysRemaining <= soonWindowDays) {
    return { status: 'expiring_soon', daysRemaining };
  }
  return { status: 'valid', daysRemaining };
}

export function summarizeProductExpiryAlerts(
  products: NovaProduct[],
  referenceDate: Date = new Date(),
  soonWindowDays = EXPIRING_SOON_DAYS
): ProductExpiryAlert[] {
  const alerts: ProductExpiryAlert[] = [];

  for (const product of products) {
    const batches: ProductBatch[] = Array.isArray(product.batches) ? product.batches : [];
    for (const batch of batches) {
      if (Number(batch.quantity || 0) <= 0) continue;
      const evalResult = evaluateBatchExpiryStatus(
        batch.expiryDate,
        referenceDate,
        soonWindowDays
      );
      if (evalResult.status === 'expired' || evalResult.status === 'expiring_soon') {
        alerts.push({
          productId: product.id,
          productName: product.name,
          ...(product.barcode ? { barcode: product.barcode } : {}),
          batchId: batch.id,
          batchNumber: batch.batchNumber || 'Batch',
          expiryDate: batch.expiryDate,
          quantity: Number(batch.quantity || 0),
          status: evalResult.status,
          daysRemaining: evalResult.daysRemaining ?? 0,
        });
      }
    }
  }

  return alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

export function serializeNovaBillForNewSale(
  items: NovaScanBillLine[]
): Array<{ name: string; quantity: number; unitPrice: number; unit?: string }> {
  return items
    .filter((item) => item.name.trim() && item.quantity > 0 && item.sellingPrice !== null && item.sellingPrice >= 0)
    .map((item) => {
      const displayName = item.packSize
        ? `${item.name.trim()} (${item.packSize})`
        : item.name.trim();
      return {
        name: displayName,
        quantity: item.quantity,
        unitPrice: Number(item.sellingPrice || 0),
        unit: item.unit || 'pcs',
      };
    });
}

export interface InlineSaleDraftRow {
  id: string;
  barcode?: string;
  productId?: string;
  name: string;
  quantityText: string;
  priceText: string;
  unit?: string;
}

/**
 * Adds a scanned product to NewSale rows strictly ONCE per completed scan:
 * - Replaces an initial untouched blank row cleanly.
 * - Preserves manual quantity control (camera detection never auto-loops quantity).
 * - Uses shop's saved selling price when present, or leaves priceText empty to prompt entry.
 */
export function addSingleScannedProductToSaleRows<T extends InlineSaleDraftRow>(
  currentRows: T[],
  scanned: {
    id: string;
    barcode?: string;
    productId?: string;
    name: string;
    packSize?: string;
    unit?: string;
    savedSellingPrice?: number;
    suggestedSellingPrice?: number;
  }
): { rows: T[]; addedRowId: string; needsPriceEntry: boolean } {
  const cleanName = scanned.packSize
    ? `${scanned.name.trim()} (${scanned.packSize.trim()})`
    : scanned.name.trim();
  const hasSavedPrice =
    typeof scanned.savedSellingPrice === 'number' &&
    Number.isFinite(scanned.savedSellingPrice) &&
    scanned.savedSellingPrice > 0;
  const hasSuggestedPrice =
    !hasSavedPrice &&
    typeof scanned.suggestedSellingPrice === 'number' &&
    Number.isFinite(scanned.suggestedSellingPrice) &&
    scanned.suggestedSellingPrice > 0;
  const resolvedPrice = hasSavedPrice
    ? scanned.savedSellingPrice
    : hasSuggestedPrice
      ? scanned.suggestedSellingPrice
      : undefined;

  const isInitialBlank =
    currentRows.length === 1 &&
    !currentRows[0].name.trim() &&
    !currentRows[0].quantityText.trim() &&
    !currentRows[0].priceText.trim();

  const newRow = {
    id: scanned.id,
    ...(scanned.barcode ? { barcode: normalizeBarcode(scanned.barcode) } : {}),
    ...(scanned.productId ? { productId: scanned.productId } : {}),
    name: cleanName,
    quantityText: '1',
    priceText: resolvedPrice !== undefined ? String(resolvedPrice) : '',
    unit: scanned.unit?.trim() || 'pcs',
  } as T;

  return {
    rows: isInitialBlank ? [newRow] : [...currentRows, newRow],
    addedRowId: scanned.id,
    needsPriceEntry: resolvedPrice === undefined,
  };
}

export function mergeAndSearchGlobalProducts(
  sources: GlobalProduct[],
  rawQuery?: string,
  limit = 60
): GlobalProduct[] {
  const byBarcode = new Map<string, GlobalProduct>();
  for (const item of sources) {
    if (!item || !item.barcode || !item.name) continue;
    const clean = normalizeBarcode(item.barcode);
    if (!clean) continue;
    const prev = byBarcode.get(clean);
    if (!prev || (item.updatedAt || '') > (prev.updatedAt || '')) {
      byBarcode.set(clean, {
        ...prev,
        ...item,
        barcode: clean,
      });
    }
  }

  const q = String(rawQuery || '').trim().toLowerCase();
  const list = Array.from(byBarcode.values()).filter((p) => {
    if (!q) return true;
    return (
      p.barcode.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      (p.brand || '').toLowerCase().includes(q) ||
      (p.categories || '').toLowerCase().includes(q) ||
      (p.packSize || '').toLowerCase().includes(q)
    );
  });

  list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return list.slice(0, Math.max(1, limit));
}
