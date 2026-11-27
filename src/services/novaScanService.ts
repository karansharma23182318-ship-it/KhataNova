import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
} from 'firebase/firestore';
import { auth, db } from '../firebase/firebase';
import { shopSubCollection } from '../firebase/firestore';
import type { GlobalProduct, GlobalProductLookupResult, NovaProduct } from '../types/models';
import {
  doPackSizesConflict,
  mergeAndSearchGlobalProducts,
  normalizeBarcode,
  toSafeBarcodeDocId,
} from '../utils/novaScan';
import { shopApiFetch } from './apiClient';
import { readShopVault, writeShopVault } from './localVault';

const CLIENT_GLOBAL_CACHE_TTL_MS = 3 * 60 * 1000;
const clientGlobalCache = new Map<
  string,
  { expiresAtMs: number; result: GlobalProductLookupResult }
>();

function stripShopSpecificFields(res: GlobalProductLookupResult): GlobalProductLookupResult {
  const gp = res.globalProduct || null;
  if (gp) {
    return {
      found: true,
      barcode: gp.barcode || res.barcode,
      source: res.source === 'shop' ? 'global' : res.source,
      cached: false,
      productName: gp.name,
      ...(gp.brand ? { brand: gp.brand } : {}),
      ...(gp.packSize ? { packSize: gp.packSize } : {}),
      ...(gp.categories ? { categories: gp.categories } : {}),
      ...(gp.imageUrl ? { imageUrl: gp.imageUrl } : {}),
      ...(typeof gp.suggestedPrice === 'number' ? { suggestedPrice: gp.suggestedPrice } : {}),
      globalProduct: gp,
      shopProduct: null,
    };
  }
  return {
    ...res,
    shopProduct: null,
  };
}

async function fetchGlobalProductFromFirestore(
  barcode: string
): Promise<GlobalProduct | null> {
  if (!barcode) return null;
  try {
    const safeId = toSafeBarcodeDocId(barcode);
    const snap = await getDoc(doc(db, 'globalProducts', safeId));
    if (!snap.exists()) return null;
    const data = snap.data() as GlobalProduct;
    if (!data?.barcode || !data?.name) return null;
    return data;
  } catch {
    return null;
  }
}

async function fetchGlobalProductsFromFirestore(): Promise<GlobalProduct[]> {
  try {
    const q = query(collection(db, 'globalProducts'), limit(80));
    const snap = await getDocs(q);
    const list: GlobalProduct[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as GlobalProduct;
      if (data?.barcode && data?.name) {
        list.push(data);
      }
    });
    return list;
  } catch {
    return [];
  }
}

async function mirrorGlobalProductToFirestore(
  globalProduct: GlobalProduct | null | undefined,
  options: { allowGlobalUpdate?: boolean } = {}
): Promise<void> {
  if (!globalProduct || !globalProduct.barcode || !globalProduct.name) return;
  try {
    const safeId = toSafeBarcodeDocId(globalProduct.barcode);
    const ref = doc(db, 'globalProducts', safeId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        barcode: globalProduct.barcode,
        name: globalProduct.name,
        ...(globalProduct.brand ? { brand: globalProduct.brand } : {}),
        ...(globalProduct.packSize ? { packSize: globalProduct.packSize } : {}),
        ...(globalProduct.categories ? { categories: globalProduct.categories } : {}),
        ...(globalProduct.imageUrl ? { imageUrl: globalProduct.imageUrl } : {}),
        unit: globalProduct.unit || 'pcs',
        ...(typeof globalProduct.suggestedPrice === 'number'
          ? { suggestedPrice: globalProduct.suggestedPrice }
          : {}),
        source: globalProduct.source || 'community',
        ...(globalProduct.createdByUid ? { createdByUid: globalProduct.createdByUid } : {}),
        createdAt: globalProduct.createdAt,
        updatedAt: globalProduct.updatedAt,
      });
      return;
    }

    const existing = snap.data() as GlobalProduct;
    const currentUid = auth.currentUser?.uid;
    const isCreator = Boolean(currentUid && existing.createdByUid && existing.createdByUid === currentUid);
    const patch: Record<string, unknown> = {};

    if (options.allowGlobalUpdate && isCreator) {
      if (globalProduct.name && globalProduct.name !== existing.name) patch.name = globalProduct.name;
      if (globalProduct.brand && globalProduct.brand !== existing.brand) patch.brand = globalProduct.brand;
      if (globalProduct.packSize && globalProduct.packSize !== existing.packSize) {
        patch.packSize = globalProduct.packSize;
      }
      if (globalProduct.categories && globalProduct.categories !== existing.categories) {
        patch.categories = globalProduct.categories;
      }
      if (globalProduct.imageUrl && globalProduct.imageUrl !== existing.imageUrl) {
        patch.imageUrl = globalProduct.imageUrl;
      }
      if (globalProduct.unit && globalProduct.unit !== existing.unit) patch.unit = globalProduct.unit;
      if (
        typeof globalProduct.suggestedPrice === 'number' &&
        globalProduct.suggestedPrice > 0 &&
        globalProduct.suggestedPrice !== existing.suggestedPrice
      ) {
        patch.suggestedPrice = globalProduct.suggestedPrice;
      }
    } else {
      if (!existing.brand && globalProduct.brand) patch.brand = globalProduct.brand;
      if (!existing.packSize && globalProduct.packSize) patch.packSize = globalProduct.packSize;
      if ((!existing.categories || options.allowGlobalUpdate) && globalProduct.categories && globalProduct.categories !== existing.categories) {
        patch.categories = globalProduct.categories;
      }
      if ((!existing.imageUrl || options.allowGlobalUpdate) && globalProduct.imageUrl && globalProduct.imageUrl !== existing.imageUrl) {
        patch.imageUrl = globalProduct.imageUrl;
      }
      if (
        (existing.suggestedPrice === undefined || existing.suggestedPrice <= 0) &&
        typeof globalProduct.suggestedPrice === 'number' &&
        globalProduct.suggestedPrice > 0
      ) {
        patch.suggestedPrice = globalProduct.suggestedPrice;
      }
    }

    if (Object.keys(patch).length > 0) {
      patch.updatedAt = globalProduct.updatedAt || new Date().toISOString();
      await setDoc(ref, patch, { merge: true });
    }
  } catch {
    // Non-blocking mirror: Express API + RTDB handle persistence if Firestore rules aren't deployed yet
  }
}

async function mirrorNovaProductToFirestore(
  shopId: string,
  product: NovaProduct
): Promise<void> {
  if (!shopId || !product.id) return;
  try {
    const ref = doc(shopSubCollection(shopId, 'novaProducts'), product.id);
    await setDoc(ref, { ...product, shopId }, { merge: true });
  } catch {
    // Non-blocking mirror: Express API + RTDB + localVault handle persistence if Firestore rules aren't deployed yet
  }
}

export async function lookupBarcodeGlobal(
  rawBarcode: string,
  shopId?: string,
  options: { fresh?: boolean } = {}
): Promise<GlobalProductLookupResult> {
  const barcode = normalizeBarcode(rawBarcode);
  const now = Date.now();
  const cached = !options.fresh ? clientGlobalCache.get(barcode) : undefined;
  const cachedShopProduct =
    shopId
      ? readShopVault(shopId)?.novaProducts?.find(
          (p) =>
            normalizeBarcode(p.barcode || '') === barcode &&
            (!cached || !doPackSizesConflict(p.packSize, cached.result.packSize))
        ) || null
      : null;

  if (cached && cached.expiresAtMs > now) {
    const base = cached.result;
    return {
      ...base,
      cached: true,
      ...(cachedShopProduct
        ? {
            productName: cachedShopProduct.name || base.productName,
            ...(cachedShopProduct.brand || base.brand
              ? { brand: cachedShopProduct.brand || base.brand }
              : {}),
            ...(cachedShopProduct.packSize || base.packSize
              ? { packSize: cachedShopProduct.packSize || base.packSize }
              : {}),
            ...(cachedShopProduct.categories || base.categories
              ? { categories: cachedShopProduct.categories || base.categories }
              : {}),
            ...(cachedShopProduct.imageUrl || base.imageUrl
              ? { imageUrl: cachedShopProduct.imageUrl || base.imageUrl }
              : {}),
            shopProduct: cachedShopProduct,
          }
        : { shopProduct: null }),
    };
  }

  let [res, fsGlobal] = await Promise.all([
    shopApiFetch<GlobalProductLookupResult>(
      `/api/nova-scan/lookup/${encodeURIComponent(barcode)}`,
      { method: 'GET' }
    ),
    fetchGlobalProductFromFirestore(barcode),
  ]);

  const expressUpdatedAt = res.globalProduct?.updatedAt || '';
  const fsUpdatedAt = fsGlobal?.updatedAt || '';
  const firestoreHasNewerOrMissing =
    Boolean(fsGlobal) && (!res.found || (fsUpdatedAt && fsUpdatedAt > expressUpdatedAt));

  if (firestoreHasNewerOrMissing && fsGlobal) {
    res = {
      found: true,
      barcode: fsGlobal.barcode || barcode,
      source: 'global',
      cached: false,
      productName: res.shopProduct?.name || fsGlobal.name,
      ...(res.shopProduct?.brand || fsGlobal.brand
        ? { brand: res.shopProduct?.brand || fsGlobal.brand }
        : {}),
      ...(res.shopProduct?.packSize || fsGlobal.packSize
        ? { packSize: res.shopProduct?.packSize || fsGlobal.packSize }
        : {}),
      ...(res.shopProduct?.categories || fsGlobal.categories
        ? { categories: res.shopProduct?.categories || fsGlobal.categories }
        : {}),
      ...(res.shopProduct?.imageUrl || fsGlobal.imageUrl
        ? { imageUrl: res.shopProduct?.imageUrl || fsGlobal.imageUrl }
        : {}),
      ...(typeof fsGlobal.suggestedPrice === 'number'
        ? { suggestedPrice: fsGlobal.suggestedPrice }
        : typeof res.suggestedPrice === 'number'
          ? { suggestedPrice: res.suggestedPrice }
          : {}),
      globalProduct: fsGlobal,
      shopProduct: res.shopProduct || cachedShopProduct || null,
    };
  }

  if (res.found) {
    clientGlobalCache.set(barcode, {
      expiresAtMs: now + CLIENT_GLOBAL_CACHE_TTL_MS,
      result: stripShopSpecificFields(res),
    });
  }

  return res;
}

export async function searchGlobalProducts(rawQuery = ''): Promise<GlobalProduct[]> {
  const [apiRes, fsList] = await Promise.all([
    shopApiFetch<{ products: GlobalProduct[] }>(
      `/api/nova-scan/global/search?q=${encodeURIComponent(rawQuery.trim())}`,
      { method: 'GET' }
    ).catch(() => ({ products: [] as GlobalProduct[] })),
    fetchGlobalProductsFromFirestore(),
  ]);

  return mergeAndSearchGlobalProducts([...(apiRes.products || []), ...fsList], rawQuery, 60);
}

export async function listNovaProducts(shopId: string): Promise<NovaProduct[]> {
  try {
    const res = await shopApiFetch<{ products: NovaProduct[] }>('/api/nova-scan/products', {
      method: 'GET',
    });
    writeShopVault(shopId, { novaProducts: res.products });
    return res.products;
  } catch (err) {
    const cached = readShopVault(shopId)?.novaProducts;
    if (cached && cached.length > 0) return cached;
    throw err;
  }
}

export async function saveNovaProduct(
  shopId: string,
  input: {
    id?: string;
    barcode?: string;
    name: string;
    brand?: string;
    packSize?: string;
    categories?: string;
    imageUrl?: string;
    unit?: string;
    sellingPrice?: number;
    source?: 'global' | 'openfoodfacts' | 'manual';
    syncToGlobal?: boolean;
    allowGlobalUpdate?: boolean;
    batches?: Array<{
      id?: string;
      batchNumber: string;
      expiryDate: string;
      quantity: number;
      notes?: string;
    }>;
  }
): Promise<{
  product: NovaProduct;
  products: NovaProduct[];
  globalProduct?: GlobalProduct | null;
  variantMismatch?: boolean;
}> {
  const res = await shopApiFetch<{
    product: NovaProduct;
    products: NovaProduct[];
    globalProduct?: GlobalProduct | null;
    variantMismatch?: boolean;
  }>('/api/nova-scan/products', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  writeShopVault(shopId, { novaProducts: res.products });
  if (input.barcode) {
    clientGlobalCache.delete(normalizeBarcode(input.barcode));
  }
  await Promise.allSettled([
    mirrorNovaProductToFirestore(shopId, res.product),
    res.globalProduct
      ? mirrorGlobalProductToFirestore(res.globalProduct, {
          allowGlobalUpdate: Boolean(input.allowGlobalUpdate),
        })
      : Promise.resolve(),
  ]);
  return res;
}

export async function deleteNovaProduct(
  shopId: string,
  productId: string
): Promise<NovaProduct[]> {
  const res = await shopApiFetch<{ products: NovaProduct[] }>(
    `/api/nova-scan/products/${encodeURIComponent(productId)}`,
    { method: 'DELETE' }
  );
  writeShopVault(shopId, { novaProducts: res.products });
  clientGlobalCache.clear();
  try {
    await deleteDoc(doc(shopSubCollection(shopId, 'novaProducts'), productId));
  } catch {
    // Non-blocking mirror
  }
  return res.products;
}
