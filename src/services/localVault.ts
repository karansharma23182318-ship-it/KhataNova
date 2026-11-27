import type {
  Customer,
  DueReminderNotification,
  DueReminderSettings,
  LedgerEntry,
  NovaProduct,
  PaymentRecord,
  Sale,
  ShopProfile,
  UserProfile,
} from '../types/models';
import type { RateBookItem } from '../utils/calculator';
import { createDefaultReminderSettings, normalizeReminderSettings } from '../utils/dueReminders';

export interface ShopVaultSnapshot {
  uid: string;
  userProfile: UserProfile | null;
  shopProfile: ShopProfile | null;
  customers: Customer[];
  sales: Sale[];
  payments: PaymentRecord[];
  ledger: LedgerEntry[];
  dueReminderSettings: DueReminderSettings;
  dueNotifications: DueReminderNotification[];
  novaProducts: NovaProduct[];
  updatedAt: string;
}

const VAULT_PREFIX = 'khatanova_vault_v1:';
const RATEBOOK_PREFIX = 'khatanova_ratebook_v1:';
const LAST_UID_KEY = 'khatanova_last_uid_v1';

const DEFAULT_RATE_BOOK: RateBookItem[] = [
  { id: 'preset-rice', name: 'चावल (Rice)', unit: 'kg', baseRate: 60, updatedAt: '' },
  { id: 'preset-sugar', name: 'चीनी (Sugar)', unit: 'kg', baseRate: 44, updatedAt: '' },
  { id: 'preset-atta', name: 'आटा (Atta)', unit: 'kg', baseRate: 38, updatedAt: '' },
  { id: 'preset-oil', name: 'सरसों तेल (Oil)', unit: 'litre', baseRate: 150, updatedAt: '' },
  { id: 'preset-milk', name: 'दूध (Milk)', unit: 'litre', baseRate: 64, updatedAt: '' },
  { id: 'preset-banana', name: 'केला (Banana)', unit: 'dozen', baseRate: 60, updatedAt: '' },
];

function emptyVault(uid: string): ShopVaultSnapshot {
  return {
    uid,
    userProfile: null,
    shopProfile: null,
    customers: [],
    sales: [],
    payments: [],
    ledger: [],
    dueReminderSettings: createDefaultReminderSettings(),
    dueNotifications: [],
    novaProducts: [],
    updatedAt: new Date().toISOString(),
  };
}

function canUseStorage(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function readShopVault(uid: string | undefined | null): ShopVaultSnapshot | null {
  if (!uid || !canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(`${VAULT_PREFIX}${uid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ShopVaultSnapshot>;
    return {
      ...emptyVault(uid),
      ...parsed,
      uid,
      customers: Array.isArray(parsed.customers) ? parsed.customers : [],
      sales: Array.isArray(parsed.sales) ? parsed.sales : [],
      payments: Array.isArray(parsed.payments) ? parsed.payments : [],
      ledger: Array.isArray(parsed.ledger) ? parsed.ledger : [],
      dueReminderSettings: normalizeReminderSettings(parsed.dueReminderSettings),
      dueNotifications: Array.isArray(parsed.dueNotifications) ? parsed.dueNotifications : [],
      novaProducts: Array.isArray(parsed.novaProducts) ? parsed.novaProducts : [],
    };
  } catch {
    return null;
  }
}

export function saveLastActiveUid(uid: string | undefined | null): void {
  if (!uid || !canUseStorage()) return;
  try {
    window.localStorage.setItem(LAST_UID_KEY, uid);
  } catch {
    // ignore storage errors
  }
}

export function readLastActiveUid(): string | null {
  if (!canUseStorage()) return null;
  try {
    const val = window.localStorage.getItem(LAST_UID_KEY);
    return val && val.trim() ? val.trim() : null;
  } catch {
    return null;
  }
}

export function clearLastActiveUid(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(LAST_UID_KEY);
  } catch {
    // ignore storage errors
  }
}

function notifyVaultDataChanged(uid: string | undefined | null): void {
  if (!uid || typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return;
  }
  window.dispatchEvent(new CustomEvent('khatanova:data-changed', { detail: { uid } }));
}

export function writeShopVault(
  uid: string | undefined | null,
  patch: Partial<Omit<ShopVaultSnapshot, 'uid' | 'updatedAt'>>,
  options: { silent?: boolean } = {}
): ShopVaultSnapshot | null {
  if (!uid || !canUseStorage()) return null;
  try {
    const current = readShopVault(uid) || emptyVault(uid);
    const next: ShopVaultSnapshot = {
      ...current,
      ...patch,
      userProfile: patch.userProfile !== undefined ? patch.userProfile : current.userProfile,
      shopProfile: patch.shopProfile !== undefined ? patch.shopProfile : current.shopProfile,
      uid,
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(`${VAULT_PREFIX}${uid}`, JSON.stringify(next));
    if (!options.silent) {
      notifyVaultDataChanged(uid);
    }
    return next;
  } catch {
    return null;
  }
}

export function mergeCustomerIntoVault(uid: string | undefined | null, customer: Customer): void {
  if (!uid) return;
  const current = readShopVault(uid) || emptyVault(uid);
  const idx = current.customers.findIndex((c) => c.id === customer.id);
  const nextCustomers = [...current.customers];
  if (idx >= 0) {
    nextCustomers[idx] = customer;
  } else {
    nextCustomers.push(customer);
  }
  nextCustomers.sort((a, b) => a.name.localeCompare(b.name));
  writeShopVault(uid, { customers: nextCustomers });
}

export function readRateBook(uid: string | undefined | null): RateBookItem[] {
  if (!canUseStorage()) return DEFAULT_RATE_BOOK;
  const key = `${RATEBOOK_PREFIX}${uid || 'guest'}`;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return DEFAULT_RATE_BOOK;
    const parsed = JSON.parse(raw) as RateBookItem[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_RATE_BOOK;
  } catch {
    return DEFAULT_RATE_BOOK;
  }
}

export function saveRateBookItem(
  uid: string | undefined | null,
  input: { name: string; unit: RateBookItem['unit']; baseRate: number }
): RateBookItem[] {
  const cleanName = input.name.trim();
  const safeRate = Math.max(0, Number(input.baseRate) || 0);
  if (!cleanName || safeRate <= 0) return readRateBook(uid);

  const existing = readRateBook(uid);
  const now = new Date().toISOString();
  const matchIdx = existing.findIndex(
    (item) => item.name.trim().toLowerCase() === cleanName.toLowerCase()
  );

  const nextList = [...existing];
  if (matchIdx >= 0) {
    nextList[matchIdx] = {
      ...nextList[matchIdx],
      name: cleanName,
      unit: input.unit,
      baseRate: safeRate,
      updatedAt: now,
    };
  } else {
    nextList.unshift({
      id: `rate-${Date.now()}`,
      name: cleanName,
      unit: input.unit,
      baseRate: safeRate,
      updatedAt: now,
    });
  }

  if (canUseStorage()) {
    try {
      window.localStorage.setItem(
        `${RATEBOOK_PREFIX}${uid || 'guest'}`,
        JSON.stringify(nextList.slice(0, 60))
      );
      if (uid) notifyVaultDataChanged(uid);
    } catch {
      // ignore storage quota errors
    }
  }
  return nextList;
}

export function removeRateBookItem(uid: string | undefined | null, id: string): RateBookItem[] {
  const existing = readRateBook(uid);
  const nextList = existing.filter((item) => item.id !== id);
  if (canUseStorage()) {
    try {
      window.localStorage.setItem(`${RATEBOOK_PREFIX}${uid || 'guest'}`, JSON.stringify(nextList));
      if (uid) notifyVaultDataChanged(uid);
    } catch {
      // ignore storage errors
    }
  }
  return nextList;
}

export function writeRateBook(
  uid: string | undefined | null,
  items: RateBookItem[]
): RateBookItem[] {
  const validItems = Array.isArray(items)
    ? items
        .filter(
          (item) =>
            item &&
            typeof item.name === 'string' &&
            item.name.trim().length > 0 &&
            typeof item.baseRate === 'number' &&
            item.baseRate >= 0
        )
        .slice(0, 60)
    : [];

  if (canUseStorage() && validItems.length > 0) {
    try {
      window.localStorage.setItem(
        `${RATEBOOK_PREFIX}${uid || 'guest'}`,
        JSON.stringify(validItems)
      );
    } catch {
      // ignore storage errors
    }
  }
  return readRateBook(uid);
}
