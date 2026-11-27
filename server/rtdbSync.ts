import type {
  Customer,
  DueReminderNotification,
  DueReminderSettings,
  GlobalProduct,
  LedgerEntry,
  NovaProduct,
  PaymentRecord,
  Sale,
  ShopProfile,
  UserProfile,
} from '../src/types/models.ts';
import type { RateBookItem } from '../src/utils/calculator.ts';
import { toSafeBarcodeDocId } from '../src/utils/novaScan.ts';

const FIREBASE_RTDB_BASE_URL = 'https://khatanova-f42f1-default-rtdb.firebaseio.com';
const RTDB_TIMEOUT_MS = 4000;

export interface RtdbUserSnapshot {
  userProfile?: UserProfile | null;
  shopProfile?: ShopProfile | null;
  customers?: Customer[];
  sales?: Sale[];
  payments?: PaymentRecord[];
  ledger?: LedgerEntry[];
  dueReminderSettings?: DueReminderSettings | null;
  dueNotifications?: DueReminderNotification[];
  novaProducts?: NovaProduct[];
  rateBook?: RateBookItem[];
  syncedAt?: string;
}

export async function fetchUserSnapshotFromRtdb(
  uid: string,
  idToken: string
): Promise<RtdbUserSnapshot | null> {
  if (!uid || !idToken) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RTDB_TIMEOUT_MS);

  try {
    const url = `${FIREBASE_RTDB_BASE_URL}/khatanova_shops/${encodeURIComponent(uid)}.json?auth=${encodeURIComponent(idToken)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as RtdbUserSnapshot | null;
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function pushUserSnapshotToRtdb(
  uid: string,
  idToken: string,
  snapshot: RtdbUserSnapshot
): Promise<boolean> {
  if (!uid || !idToken) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RTDB_TIMEOUT_MS);

  try {
    const url = `${FIREBASE_RTDB_BASE_URL}/khatanova_shops/${encodeURIComponent(uid)}.json?auth=${encodeURIComponent(idToken)}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...snapshot,
        syncedAt: new Date().toISOString(),
      }),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchGlobalProductFromRtdb(
  barcode: string,
  idToken: string
): Promise<GlobalProduct | null> {
  if (!barcode || !idToken) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RTDB_TIMEOUT_MS);

  try {
    const safeKey = toSafeBarcodeDocId(barcode);
    const url = `${FIREBASE_RTDB_BASE_URL}/khatanova_global_products/${encodeURIComponent(safeKey)}.json?auth=${encodeURIComponent(idToken)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as GlobalProduct | null;
    if (!data || typeof data !== 'object' || !data.barcode || !data.name) return null;
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchAllGlobalProductsFromRtdb(
  idToken: string
): Promise<GlobalProduct[]> {
  if (!idToken) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RTDB_TIMEOUT_MS);

  try {
    const url = `${FIREBASE_RTDB_BASE_URL}/khatanova_global_products.json?auth=${encodeURIComponent(idToken)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Record<string, GlobalProduct> | null;
    if (!data || typeof data !== 'object') return [];
    return Object.values(data).filter(
      (item): item is GlobalProduct => Boolean(item && item.barcode && item.name)
    );
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function pushGlobalProductToRtdb(
  product: GlobalProduct,
  idToken: string
): Promise<boolean> {
  if (!product?.barcode || !product?.name || !idToken) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RTDB_TIMEOUT_MS);

  try {
    const safeKey = toSafeBarcodeDocId(product.barcode);
    const url = `${FIREBASE_RTDB_BASE_URL}/khatanova_global_products/${encodeURIComponent(safeKey)}.json?auth=${encodeURIComponent(idToken)}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
