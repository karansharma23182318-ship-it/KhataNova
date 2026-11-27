import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, firebaseConfig } from '../firebase/firebase';
import { shopDocRef, shopSubCollection } from '../firebase/firestore';
import type { Customer, ShopProfile } from '../types/models';
import { shopApiFetch } from './apiClient';

interface RtdbShopPayload {
  shopProfile?: ShopProfile | null;
  customers?: Customer[];
}

function parseUpdatedAtMs(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickNewestShop(candidates: Array<ShopProfile | null | undefined>): ShopProfile | null {
  let best: ShopProfile | null = null;
  let bestTime = -1;
  for (const item of candidates) {
    if (!item || !item.shopName) continue;
    const t = parseUpdatedAtMs(item.updatedAt || item.createdAt);
    if (!best || t >= bestTime) {
      best = item;
      bestTime = t;
    }
  }
  return best;
}

function pickNewestCustomer(candidates: Array<Customer | null | undefined>): Customer | null {
  let best: Customer | null = null;
  let bestTime = -1;
  for (const item of candidates) {
    if (!item || !item.id) continue;
    const t = parseUpdatedAtMs(item.updatedAt || item.createdAt);
    if (!best || t >= bestTime) {
      best = item;
      bestTime = t;
    }
  }
  return best;
}

async function fetchFromFirebaseRtdb(
  uid: string,
  idToken: string
): Promise<RtdbShopPayload | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 2500);
  try {
    const url = `${firebaseConfig.databaseURL}/khatanova_shops/${encodeURIComponent(uid)}.json?auth=${encodeURIComponent(idToken)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as RtdbShopPayload | null;
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

async function fetchShopFromFirestore(uid: string): Promise<ShopProfile | null> {
  try {
    const snap = await Promise.race([
      getDoc(shopDocRef(uid)),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 2500)),
    ]);
    if (!snap || !snap.exists()) return null;
    return snap.data() as ShopProfile;
  } catch {
    return null;
  }
}

async function fetchCustomerFromFirestore(
  uid: string,
  customerId: string
): Promise<Customer | null> {
  try {
    const ref = doc(shopSubCollection(uid, 'customers'), customerId);
    const snap = await Promise.race([
      getDoc(ref),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 2500)),
    ]);
    if (!snap || !snap.exists()) return null;
    return snap.data() as Customer;
  } catch {
    return null;
  }
}

export async function mirrorShopProfileToFirestore(
  uid: string,
  profile: ShopProfile | null | undefined
): Promise<void> {
  if (!uid || !profile) return;
  try {
    await setDoc(
      shopDocRef(uid),
      {
        ...profile,
        id: profile.id || uid,
        ownerUid: uid,
      },
      { merge: true }
    );
  } catch {
    // Non-blocking mirror: RTDB and API remain primary if Firestore rules are pending deploy
  }
}

export async function mirrorCustomerToFirestore(
  uid: string,
  customer: Customer | null | undefined
): Promise<void> {
  if (!uid || !customer?.id) return;
  try {
    const ref = doc(shopSubCollection(uid, 'customers'), customer.id);
    await setDoc(
      ref,
      {
        ...customer,
        shopId: uid,
      },
      { merge: true }
    );
  } catch {
    // Non-blocking mirror
  }
}

export interface DynamicReminderDetails {
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  customer: Customer;
}

export async function fetchDynamicCustomerReminderData(options: {
  uid?: string;
  customer: Customer;
  fallbackShop?: ShopProfile | null;
}): Promise<DynamicReminderDetails> {
  const activeUser = auth.currentUser;
  const uid = options.uid || activeUser?.uid || options.fallbackShop?.ownerUid || '';

  let idToken = '';
  if (activeUser) {
    try {
      idToken = await activeUser.getIdToken();
    } catch {
      idToken = '';
    }
  }

  const [rtdbData, firestoreShop, firestoreCustomer, apiProfile, apiCustomer] =
    await Promise.all([
      uid && idToken ? fetchFromFirebaseRtdb(uid, idToken) : Promise.resolve(null),
      uid ? fetchShopFromFirestore(uid) : Promise.resolve(null),
      uid ? fetchCustomerFromFirestore(uid, options.customer.id) : Promise.resolve(null),
      idToken
        ? shopApiFetch<{ shopProfile?: ShopProfile | null }>(
            '/api/shop/profile',
            { method: 'GET' },
            idToken
          ).catch(() => null)
        : Promise.resolve(null),
      idToken
        ? shopApiFetch<{ customer?: Customer | null }>(
            `/api/shop/customers/${encodeURIComponent(options.customer.id)}`,
            { method: 'GET' },
            idToken
          ).catch(() => null)
        : Promise.resolve(null),
    ]);

  const rtdbCustomer = Array.isArray(rtdbData?.customers)
    ? rtdbData.customers.find((item) => item.id === options.customer.id) || null
    : null;

  const latestShop = pickNewestShop([
    options.fallbackShop,
    apiProfile?.shopProfile,
    rtdbData?.shopProfile,
    firestoreShop,
  ]);

  const latestCustomer =
    pickNewestCustomer([
      options.customer,
      apiCustomer?.customer,
      rtdbCustomer,
      firestoreCustomer,
    ]) || options.customer;

  return {
    shopName: latestShop?.shopName?.trim() || 'KhataNova',
    shopAddress: latestShop?.address?.trim() || '',
    shopPhone:
      latestShop?.phoneNumber?.trim() || latestShop?.whatsappNumber?.trim() || '',
    customer: latestCustomer,
  };
}
