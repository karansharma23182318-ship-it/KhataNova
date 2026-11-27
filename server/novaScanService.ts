import {
  KHATANOVA_OFF_USER_AGENT,
  buildOpenFoodFactsUrl,
  isValidBarcode,
  normalizeBarcode,
  parseOpenFoodFactsResponse,
} from '../src/utils/novaScan.ts';

interface CachedLookupEntry {
  found: boolean;
  barcode: string;
  productName?: string;
  brand?: string;
  packSize?: string;
  productQuantity?: string | number;
  categories?: string;
  imageUrl?: string;
  cachedAtMs: number;
  expiresAtMs: number;
}

const FOUND_TTL_MS = 24 * 60 * 60 * 1000;
const NOT_FOUND_TTL_MS = 10 * 60 * 1000;
const OFF_TIMEOUT_MS = 8000;

const globalBarcodeCache = new Map<string, CachedLookupEntry>();

export class NovaScanLookupError extends Error {
  public readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

export async function lookupOpenFoodFactsProduct(
  rawBarcode: string,
  options: {
    fetchImpl?: typeof fetch;
    bypassCache?: boolean;
  } = {}
): Promise<{
  found: boolean;
  barcode: string;
  source: 'openfoodfacts' | 'cache';
  cached: boolean;
  productName?: string;
  brand?: string;
  packSize?: string;
  productQuantity?: string | number;
  categories?: string;
  imageUrl?: string;
}> {
  const barcode = normalizeBarcode(rawBarcode);
  if (!isValidBarcode(barcode)) {
    throw new NovaScanLookupError(
      'Invalid barcode format. Supported: EAN-13, EAN-8, UPC-A, UPC-E, and Code 128.',
      400
    );
  }

  const nowMs = Date.now();
  if (!options.bypassCache) {
    const cached = globalBarcodeCache.get(barcode);
    if (cached && cached.expiresAtMs > nowMs) {
      return {
        found: cached.found,
        barcode: cached.barcode,
        source: 'cache',
        cached: true,
        ...(cached.productName ? { productName: cached.productName } : {}),
        ...(cached.brand ? { brand: cached.brand } : {}),
        ...(cached.packSize ? { packSize: cached.packSize } : {}),
        ...(cached.productQuantity !== undefined
          ? { productQuantity: cached.productQuantity }
          : {}),
        ...(cached.categories ? { categories: cached.categories } : {}),
        ...(cached.imageUrl ? { imageUrl: cached.imageUrl } : {}),
      };
    }
  }

  const fetchFn = options.fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OFF_TIMEOUT_MS);

  try {
    const res = await fetchFn(buildOpenFoodFactsUrl(barcode), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': KHATANOVA_OFF_USER_AGENT,
      },
      signal: controller.signal,
    });

    if (res.status === 429) {
      throw new NovaScanLookupError(
        'Open Food Facts rate limit reached. Please wait a few seconds before scanning again.',
        429
      );
    }

    if (res.status === 404) {
      globalBarcodeCache.set(barcode, {
        found: false,
        barcode,
        cachedAtMs: nowMs,
        expiresAtMs: nowMs + NOT_FOUND_TTL_MS,
      });
      return {
        found: false,
        barcode,
        source: 'openfoodfacts',
        cached: false,
      };
    }

    if (!res.ok) {
      throw new NovaScanLookupError(
        `Open Food Facts lookup failed (${res.status}). You can enter product details manually.`,
        502
      );
    }

    const json = (await res.json()) as unknown;
    const parsed = parseOpenFoodFactsResponse(json, barcode);

    globalBarcodeCache.set(barcode, {
      ...parsed,
      cachedAtMs: nowMs,
      expiresAtMs: nowMs + (parsed.found ? FOUND_TTL_MS : NOT_FOUND_TTL_MS),
    });

    return {
      ...parsed,
      source: 'openfoodfacts',
      cached: false,
    };
  } catch (err) {
    if (err instanceof NovaScanLookupError) {
      throw err;
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new NovaScanLookupError(
        'Product lookup timed out while contacting Open Food Facts. You can add this product manually.',
        504
      );
    }
    throw new NovaScanLookupError(
      'Unable to reach Open Food Facts right now. Check connection or enter product manually.',
      502
    );
  } finally {
    clearTimeout(timer);
  }
}

export function clearNovaScanCache(): void {
  globalBarcodeCache.clear();
}
