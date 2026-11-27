import type {
  Customer,
  DueReminderNotification,
  DueReminderSettings,
  LedgerEntry,
  Sale,
} from '../types/models';

export const DEFAULT_REMINDER_INTERVAL_DAYS = 7;
export const MIN_REMINDER_INTERVAL_DAYS = 1;
export const MAX_REMINDER_INTERVAL_DAYS = 365;
export const DAY_MS = 24 * 60 * 60 * 1000;

export function createDefaultReminderSettings(updatedAt = ''): DueReminderSettings {
  return {
    enabled: true,
    intervalDays: DEFAULT_REMINDER_INTERVAL_DAYS,
    browserPushEnabled: false,
    updatedAt,
  };
}

export function clampReminderIntervalDays(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < MIN_REMINDER_INTERVAL_DAYS) {
    return DEFAULT_REMINDER_INTERVAL_DAYS;
  }
  return Math.min(MAX_REMINDER_INTERVAL_DAYS, Math.max(MIN_REMINDER_INTERVAL_DAYS, Math.round(num)));
}

export function normalizeReminderSettings(
  input?: Partial<DueReminderSettings> | null
): DueReminderSettings {
  return {
    enabled: input?.enabled !== undefined ? Boolean(input.enabled) : true,
    intervalDays: clampReminderIntervalDays(input?.intervalDays),
    browserPushEnabled: Boolean(input?.browserPushEnabled),
    updatedAt: typeof input?.updatedAt === 'string' ? input.updatedAt : '',
  };
}

interface CreditTranche {
  amount: number;
  dateMs: number;
  iso: string;
}

function parseMs(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Determines the timestamp of the oldest still-unsettled Udhaar balance for a customer
 * using FIFO settlement against credit sales / opening balance / debit ledger entries.
 */
export function findOldestUnsettledUdhaarDate(
  customer: Customer,
  sales: Sale[],
  ledger: LedgerEntry[]
): string | null {
  const balance = Number(customer.outstandingBalance || 0);
  if (balance <= 0) return null;

  const tranches: CreditTranche[] = [];

  if ((customer.openingBalance || 0) > 0) {
    const ms = parseMs(customer.createdAt) ?? Date.now();
    tranches.push({
      amount: Number(customer.openingBalance),
      dateMs: ms,
      iso: new Date(ms).toISOString(),
    });
  }

  const creditSales = sales
    .filter((s) => s.customerId === customer.id && s.status !== 'cancelled' && Number(s.dueAmount || 0) > 0)
    .sort((a, b) => (parseMs(a.createdAt) ?? 0) - (parseMs(b.createdAt) ?? 0));

  for (const sale of creditSales) {
    const ms = parseMs(sale.createdAt);
    if (ms !== null) {
      tranches.push({
        amount: Number(sale.dueAmount),
        dateMs: ms,
        iso: new Date(ms).toISOString(),
      });
    }
  }

  // Fallback to debit ledger entries if sales history is empty or smaller than current balance
  let totalCredit = tranches.reduce((sum, item) => sum + item.amount, 0);
  if (totalCredit + 0.01 < balance) {
    const debitEntries = ledger
      .filter((e) => e.customerId === customer.id && e.type === 'debit' && Number(e.debit || e.amount || 0) > 0)
      .sort((a, b) => (parseMs(a.transactionDate || a.createdAt) ?? 0) - (parseMs(b.transactionDate || b.createdAt) ?? 0));

    if (debitEntries.length > 0 && creditSales.length === 0) {
      for (const entry of debitEntries) {
        const ms = parseMs(entry.transactionDate || entry.createdAt);
        if (ms !== null) {
          tranches.push({
            amount: Number(entry.debit || entry.amount),
            dateMs: ms,
            iso: new Date(ms).toISOString(),
          });
        }
      }
      totalCredit = tranches.reduce((sum, item) => sum + item.amount, 0);
    }
  }

  tranches.sort((a, b) => a.dateMs - b.dateMs);

  if (tranches.length === 0) {
    const fallbackMs = parseMs(customer.createdAt) ?? parseMs(customer.updatedAt) ?? Date.now();
    return new Date(fallbackMs).toISOString();
  }

  // Consume settled amount FIFO from oldest tranches
  let remainingToConsume = Math.max(0, totalCredit - balance);
  for (const tranche of tranches) {
    if (remainingToConsume <= 0.001) {
      return tranche.iso;
    }
    if (tranche.amount <= remainingToConsume + 0.001) {
      remainingToConsume -= tranche.amount;
    } else {
      return tranche.iso;
    }
  }

  return tranches[tranches.length - 1].iso;
}

export interface CustomerDueEvaluation {
  customerId: string;
  customerName: string;
  outstandingBalance: number;
  anchorDate: string | null;
  dueDate: string | null;
  intervalDays: number;
  cycleNumber: number;
  daysElapsed: number;
  daysOverdue: number;
  isDue: boolean;
  dedupeKey: string | null;
}

export function evaluateCustomerDueStatus(
  customer: Customer,
  sales: Sale[],
  ledger: LedgerEntry[],
  settings: DueReminderSettings,
  nowMs: number = Date.now()
): CustomerDueEvaluation {
  const intervalDays = clampReminderIntervalDays(settings.intervalDays);
  const outstandingBalance = Math.max(0, Math.round((Number(customer.outstandingBalance || 0) + Number.EPSILON) * 100) / 100);

  if (outstandingBalance <= 0) {
    return {
      customerId: customer.id,
      customerName: customer.name,
      outstandingBalance: 0,
      anchorDate: null,
      dueDate: null,
      intervalDays,
      cycleNumber: 0,
      daysElapsed: 0,
      daysOverdue: 0,
      isDue: false,
      dedupeKey: null,
    };
  }

  const anchorDate = findOldestUnsettledUdhaarDate(customer, sales, ledger);
  const anchorMs = (anchorDate ? parseMs(anchorDate) : null) ?? nowMs;
  const elapsedMs = Math.max(0, nowMs - anchorMs);
  const daysElapsed = Math.floor(elapsedMs / DAY_MS);
  const cycleNumber = Math.floor(daysElapsed / intervalDays);

  const firstDueMs = anchorMs + intervalDays * DAY_MS;
  const effectiveCycle = Math.max(1, cycleNumber);
  const dueMs = cycleNumber >= 1 ? anchorMs + effectiveCycle * intervalDays * DAY_MS : firstDueMs;
  const dueDate = new Date(dueMs).toISOString();
  const daysOverdue = Math.floor((nowMs - firstDueMs) / DAY_MS);
  const isDue = settings.enabled && cycleNumber >= 1;
  const dedupeKey =
    cycleNumber >= 1
      ? `${customer.id}::${intervalDays}d::cycle-${cycleNumber}::${dueDate.slice(0, 10)}`
      : null;

  return {
    customerId: customer.id,
    customerName: customer.name,
    outstandingBalance,
    anchorDate,
    dueDate,
    intervalDays,
    cycleNumber,
    daysElapsed,
    daysOverdue,
    isDue,
    dedupeKey,
  };
}

function generateNotificationId(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `notif-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface ReconcileDueNotificationsInput {
  shopId: string;
  ownerUid: string;
  customers: Customer[];
  sales: Sale[];
  ledger: LedgerEntry[];
  settings: DueReminderSettings;
  existingNotifications: DueReminderNotification[];
  nowIso?: string;
  idFactory?: () => string;
}

export interface ReconcileDueNotificationsResult {
  nextNotifications: DueReminderNotification[];
  newlyCreated: DueReminderNotification[];
  autoClearedCount: number;
  evaluations: CustomerDueEvaluation[];
}

/**
 * Reconciles shopkeeper-only Udhaar due notifications:
 * 1) Automatically clears active reminders when a customer's balance becomes 0.
 * 2) Generates at most one notification per customer per due cycle (strict dedupeKey + active cycle check).
 * 3) Never produces notifications for customers with 0 balance or when disabled.
 */
export function reconcileDueNotifications(
  input: ReconcileDueNotificationsInput
): ReconcileDueNotificationsResult {
  const nowIso = input.nowIso || new Date().toISOString();
  const nowMs = parseMs(nowIso) ?? Date.now();
  const settings = normalizeReminderSettings(input.settings);
  const makeId = input.idFactory || generateNotificationId;

  const customerById = new Map<string, Customer>();
  for (const c of input.customers) {
    if (c && c.id) customerById.set(c.id, c);
  }

  let autoClearedCount = 0;
  const nextNotifications: DueReminderNotification[] = (input.existingNotifications || []).map((n) => {
    const cust = customerById.get(n.customerId);
    const currentDue = cust ? Number(cust.outstandingBalance || 0) : 0;

    if (n.status === 'active' && currentDue <= 0) {
      autoClearedCount += 1;
      return {
        ...n,
        pendingAmount: 0,
        status: 'cleared',
        clearedAt: n.clearedAt || nowIso,
        updatedAt: nowIso,
      };
    }

    if (n.status === 'active' && cust && cust.name && cust.name !== n.customerName) {
      return {
        ...n,
        customerName: cust.name,
        updatedAt: nowIso,
      };
    }

    return n;
  });

  const existingDedupeKeys = new Set<string>();
  const activeCustomerCycles = new Set<string>();
  for (const n of nextNotifications) {
    if (n.dedupeKey) existingDedupeKeys.add(n.dedupeKey);
    if (n.status === 'active') {
      activeCustomerCycles.add(`${n.customerId}::${n.intervalDays}::${n.cycleNumber}`);
      activeCustomerCycles.add(`${n.customerId}::${n.dueDate.slice(0, 10)}`);
    }
  }

  const evaluations: CustomerDueEvaluation[] = [];
  const newlyCreated: DueReminderNotification[] = [];

  for (const customer of input.customers) {
    const evalResult = evaluateCustomerDueStatus(
      customer,
      input.sales,
      input.ledger,
      settings,
      nowMs
    );
    evaluations.push(evalResult);

    if (!evalResult.isDue || !evalResult.dedupeKey || !evalResult.dueDate || !evalResult.anchorDate) {
      continue;
    }

    const cycleKey = `${customer.id}::${evalResult.intervalDays}::${evalResult.cycleNumber}`;
    const dueDayKey = `${customer.id}::${evalResult.dueDate.slice(0, 10)}`;

    if (
      existingDedupeKeys.has(evalResult.dedupeKey) ||
      activeCustomerCycles.has(cycleKey) ||
      activeCustomerCycles.has(dueDayKey)
    ) {
      continue;
    }

    const notification: DueReminderNotification = {
      id: makeId(),
      shopId: input.shopId,
      ownerUid: input.ownerUid,
      customerId: customer.id,
      customerName: customer.name,
      pendingAmount: evalResult.outstandingBalance,
      dueDate: evalResult.dueDate,
      anchorDate: evalResult.anchorDate,
      intervalDays: evalResult.intervalDays,
      cycleNumber: evalResult.cycleNumber,
      dedupeKey: evalResult.dedupeKey,
      status: 'active',
      isRead: false,
      actionUrl: `/customers/${customer.id}`,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    existingDedupeKeys.add(evalResult.dedupeKey);
    activeCustomerCycles.add(cycleKey);
    activeCustomerCycles.add(dueDayKey);
    nextNotifications.push(notification);
    newlyCreated.push(notification);
  }

  nextNotifications.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  evaluations.sort((a, b) => b.daysOverdue - a.daysOverdue || b.outstandingBalance - a.outstandingBalance);

  return {
    nextNotifications,
    newlyCreated,
    autoClearedCount,
    evaluations,
  };
}
