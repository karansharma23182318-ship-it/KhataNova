import type {
  Customer,
  LedgerEntry,
  NovaProduct,
  PaymentRecord,
  Sale,
  ShopProfile,
} from '../types/models';
import type { RateBookItem } from './calculator';

export interface ShopBackupPayload {
  app: 'KhataNova';
  schemaVersion: 1;
  exportedAt: string;
  uid?: string;
  shopProfile: ShopProfile | null;
  customers: Customer[];
  sales: Sale[];
  payments: PaymentRecord[];
  ledger: LedgerEntry[];
  novaProducts?: NovaProduct[];
  rateBook?: RateBookItem[];
}

export interface BackupCounts {
  customers: number;
  sales: number;
  payments: number;
  ledger: number;
}

export type ParseBackupResult =
  | {
      ok: true;
      payload: ShopBackupPayload;
      counts: BackupCounts;
    }
  | {
      ok: false;
      error: string;
    };

export function buildShopBackupPayload(input: {
  uid?: string;
  shopProfile: ShopProfile | null;
  customers: Customer[];
  sales: Sale[];
  payments: PaymentRecord[];
  ledger: LedgerEntry[];
  novaProducts?: NovaProduct[];
  rateBook?: RateBookItem[];
  exportedAt?: string;
}): ShopBackupPayload {
  return {
    app: 'KhataNova',
    schemaVersion: 1,
    exportedAt: input.exportedAt || new Date().toISOString(),
    ...(input.uid ? { uid: input.uid } : {}),
    shopProfile: input.shopProfile || null,
    customers: Array.isArray(input.customers) ? input.customers : [],
    sales: Array.isArray(input.sales) ? input.sales : [],
    payments: Array.isArray(input.payments) ? input.payments : [],
    ledger: Array.isArray(input.ledger) ? input.ledger : [],
    ...(Array.isArray(input.novaProducts) ? { novaProducts: input.novaProducts } : {}),
    ...(Array.isArray(input.rateBook) ? { rateBook: input.rateBook } : {}),
  };
}

function hasValidRecords(list: unknown): boolean {
  return (
    Array.isArray(list) &&
    list.every((item) => Boolean(item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string'))
  );
}

export function parseAndValidateShopBackup(rawJson: string): ParseBackupResult {
  if (!rawJson || !rawJson.trim()) {
    return { ok: false, error: 'Backup file is empty.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { ok: false, error: 'Invalid JSON file. Please select a valid KhataNova backup (.json) file.' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Invalid backup structure.' };
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.app !== undefined && obj.app !== 'KhataNova') {
    return { ok: false, error: 'This JSON file does not belong to KhataNova.' };
  }

  const hasRecognizedField =
    'shopProfile' in obj ||
    'customers' in obj ||
    'sales' in obj ||
    'payments' in obj ||
    'ledger' in obj ||
    'novaProducts' in obj;

  if (!hasRecognizedField) {
    return { ok: false, error: 'Backup file is missing shop, customer, sales, or payment records.' };
  }

  const customersRaw = obj.customers ?? [];
  const salesRaw = obj.sales ?? [];
  const paymentsRaw = obj.payments ?? [];
  const ledgerRaw = obj.ledger ?? [];
  const novaProductsRaw = obj.novaProducts ?? [];

  if (
    !hasValidRecords(customersRaw) ||
    !hasValidRecords(salesRaw) ||
    !hasValidRecords(paymentsRaw) ||
    !hasValidRecords(ledgerRaw) ||
    !hasValidRecords(novaProductsRaw)
  ) {
    return { ok: false, error: 'Backup records are malformed or missing required IDs.' };
  }

  const shopProfileRaw =
    obj.shopProfile && typeof obj.shopProfile === 'object' && !Array.isArray(obj.shopProfile)
      ? (obj.shopProfile as ShopProfile)
      : null;

  const payload = buildShopBackupPayload({
    uid: typeof obj.uid === 'string' ? obj.uid : undefined,
    shopProfile: shopProfileRaw,
    customers: customersRaw as Customer[],
    sales: salesRaw as Sale[],
    payments: paymentsRaw as PaymentRecord[],
    ledger: ledgerRaw as LedgerEntry[],
    novaProducts:
      Array.isArray(obj.novaProducts) && obj.novaProducts.length > 0
        ? (obj.novaProducts as NovaProduct[])
        : undefined,
    rateBook: Array.isArray(obj.rateBook) ? (obj.rateBook as RateBookItem[]) : undefined,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : undefined,
  });

  return {
    ok: true,
    payload,
    counts: {
      customers: payload.customers.length,
      sales: payload.sales.length,
      payments: payload.payments.length,
      ledger: payload.ledger.length,
    },
  };
}
