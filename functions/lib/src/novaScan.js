"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.novaScanLookupBarcode = void 0;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const OPEN_FOOD_FACTS_API_BASE = 'https://world.openfoodfacts.org/api/v3.6/product';
const OPEN_FOOD_FACTS_FIELDS = 'code,product_name,brands,quantity,categories,image_url,product_quantity';
const KHATANOVA_OFF_USER_AGENT = 'KhataNova/1.0 (https://khatanova.app; support@khatanova.app)';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
function normalizeBarcode(raw) {
    return typeof raw === 'string' ? raw.trim().replace(/\s+/g, '') : '';
}
function isValidBarcode(code) {
    return /^[\x21-\x7E]{4,64}$/.test(code);
}
/**
 * Callable Cloud Function for Pro-only Open Food Facts v3.6 product recognition.
 * Reuses the existing Firebase project (`khatanova-f42f1`), verifies Pro status in Firestore,
 * caches successful lookups in `global_barcode_cache`, and never invents missing fields.
 * NOT deployed automatically — review and approve before deploying.
 */
exports.novaScanLookupBarcode = (0, https_1.onCall)(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError('unauthenticated', 'Please sign in with Google first.');
    }
    const barcode = normalizeBarcode(request.data?.barcode);
    if (!isValidBarcode(barcode)) {
        throw new https_1.HttpsError('invalid-argument', 'Invalid barcode format. Supported: EAN-13, EAN-8, UPC-A, UPC-E, and Code 128.');
    }
    const db = (0, firestore_1.getFirestore)();
    const userSnap = await db.collection('users').doc(uid).get();
    const userData = userSnap.data();
    const isPro = userData?.subscriptionStatus === 'premium_active' && userData?.proModeEnabled !== false;
    if (!isPro) {
        throw new https_1.HttpsError('permission-denied', 'Nova Scan is exclusive to verified Pro subscribers.');
    }
    // Check shop's saved product catalog first for shop selling price / batches
    const shopProductSnap = await db
        .collection('shops')
        .doc(uid)
        .collection('novaProducts')
        .where('barcode', '==', barcode)
        .limit(1)
        .get();
    const shopProduct = shopProductSnap.empty
        ? null
        : { id: shopProductSnap.docs[0].id, ...shopProductSnap.docs[0].data() };
    // Check global Firestore cache
    const cacheRef = db.collection('global_barcode_cache').doc(barcode);
    const cacheSnap = await cacheRef.get();
    const cacheData = cacheSnap.data();
    if (cacheData && typeof cacheData.expiresAtMs === 'number' && cacheData.expiresAtMs > Date.now()) {
        return {
            found: Boolean(cacheData.found),
            barcode: cacheData.barcode || barcode,
            source: 'cache',
            cached: true,
            ...(cacheData.productName ? { productName: cacheData.productName } : {}),
            ...(cacheData.brand ? { brand: cacheData.brand } : {}),
            ...(cacheData.packSize ? { packSize: cacheData.packSize } : {}),
            ...(cacheData.productQuantity !== undefined
                ? { productQuantity: cacheData.productQuantity }
                : {}),
            ...(cacheData.categories ? { categories: cacheData.categories } : {}),
            ...(cacheData.imageUrl ? { imageUrl: cacheData.imageUrl } : {}),
            shopProduct,
        };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
        const url = `${OPEN_FOOD_FACTS_API_BASE}/${encodeURIComponent(barcode)}.json?fields=${OPEN_FOOD_FACTS_FIELDS}`;
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'User-Agent': KHATANOVA_OFF_USER_AGENT,
            },
            signal: controller.signal,
        });
        if (res.status === 429) {
            throw new https_1.HttpsError('resource-exhausted', 'Open Food Facts rate limit reached. Please retry shortly.');
        }
        if (res.status === 404) {
            return {
                found: false,
                barcode,
                source: 'openfoodfacts',
                cached: false,
                shopProduct,
            };
        }
        if (!res.ok) {
            throw new https_1.HttpsError('unavailable', `Open Food Facts lookup failed (${res.status}).`);
        }
        const json = (await res.json());
        if (json.status === 'failure' || json.result?.id === 'product_not_found' || !json.product) {
            return {
                found: false,
                barcode,
                source: 'openfoodfacts',
                cached: false,
                shopProduct,
            };
        }
        const pickStr = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
        const productName = pickStr(json.product.product_name);
        const brand = pickStr(json.product.brands);
        const packSize = pickStr(json.product.quantity);
        const categories = pickStr(json.product.categories);
        const imageUrl = pickStr(json.product.image_url);
        const rawQty = json.product.product_quantity;
        const productQuantity = typeof rawQty === 'number' && Number.isFinite(rawQty)
            ? rawQty
            : typeof rawQty === 'string' && rawQty.trim()
                ? rawQty.trim()
                : undefined;
        const found = Boolean(productName || brand || packSize || categories || imageUrl);
        if (found) {
            await cacheRef.set({
                found: true,
                barcode,
                ...(productName ? { productName } : {}),
                ...(brand ? { brand } : {}),
                ...(packSize ? { packSize } : {}),
                ...(productQuantity !== undefined ? { productQuantity } : {}),
                ...(categories ? { categories } : {}),
                ...(imageUrl ? { imageUrl } : {}),
                cachedAt: new Date().toISOString(),
                expiresAtMs: Date.now() + CACHE_TTL_MS,
            });
        }
        return {
            found,
            barcode,
            source: 'openfoodfacts',
            cached: false,
            ...(productName ? { productName } : {}),
            ...(brand ? { brand } : {}),
            ...(packSize ? { packSize } : {}),
            ...(productQuantity !== undefined ? { productQuantity } : {}),
            ...(categories ? { categories } : {}),
            ...(imageUrl ? { imageUrl } : {}),
            shopProduct,
        };
    }
    catch (err) {
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError('unavailable', 'Unable to reach Open Food Facts product catalog.');
    }
    finally {
        clearTimeout(timer);
    }
});
//# sourceMappingURL=novaScan.js.map