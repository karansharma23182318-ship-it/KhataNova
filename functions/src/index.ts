import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

initializeApp();

const db = getFirestore();
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INTERVAL_DAYS = 7;

interface CustomerDoc {
  id: string;
  shopId: string;
  name: string;
  openingBalance?: number;
  outstandingBalance?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface SaleDoc {
  id: string;
  customerId?: string;
  dueAmount?: number;
  status?: string;
  createdAt?: string;
}

interface ReminderSettingsDoc {
  enabled?: boolean;
  intervalDays?: number;
  browserPushEnabled?: boolean;
  ownerUid?: string;
  updatedAt?: string;
}

interface NotificationDoc {
  id: string;
  shopId: string;
  ownerUid: string;
  customerId: string;
  customerName: string;
  pendingAmount: number;
  dueDate: string;
  anchorDate: string;
  intervalDays: number;
  cycleNumber: number;
  dedupeKey: string;
  status: 'active' | 'cleared';
  isRead: boolean;
  actionUrl: string;
  createdAt: string;
  updatedAt: string;
  clearedAt?: string;
}

function clampDays(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 1) return DEFAULT_INTERVAL_DAYS;
  return Math.min(365, Math.max(1, Math.round(num)));
}

function parseMs(iso?: string): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function computeOldestUnsettledAnchor(
  customer: CustomerDoc,
  sales: SaleDoc[]
): string {
  const balance = Number(customer.outstandingBalance || 0);
  const tranches: Array<{ amount: number; dateMs: number; iso: string }> = [];

  if ((customer.openingBalance || 0) > 0) {
    const ms = parseMs(customer.createdAt) ?? Date.now();
    tranches.push({
      amount: Number(customer.openingBalance),
      dateMs: ms,
      iso: new Date(ms).toISOString(),
    });
  }

  for (const sale of sales) {
    if (
      sale.customerId === customer.id &&
      sale.status !== 'cancelled' &&
      Number(sale.dueAmount || 0) > 0
    ) {
      const ms = parseMs(sale.createdAt);
      if (ms !== null) {
        tranches.push({
          amount: Number(sale.dueAmount),
          dateMs: ms,
          iso: new Date(ms).toISOString(),
        });
      }
    }
  }

  tranches.sort((a, b) => a.dateMs - b.dateMs);
  if (tranches.length === 0) {
    return new Date(parseMs(customer.createdAt) ?? Date.now()).toISOString();
  }

  const totalCredit = tranches.reduce((sum, t) => sum + t.amount, 0);
  let remainingToConsume = Math.max(0, totalCredit - balance);
  for (const tranche of tranches) {
    if (remainingToConsume <= 0.001) return tranche.iso;
    if (tranche.amount <= remainingToConsume + 0.001) {
      remainingToConsume -= tranche.amount;
    } else {
      return tranche.iso;
    }
  }

  return tranches[tranches.length - 1].iso;
}

async function reconcileShopDueReminders(shopId: string): Promise<{
  createdCount: number;
  clearedCount: number;
}> {
  const shopRef = db.collection('shops').doc(shopId);
  const [shopSnap, settingsSnap, customersSnap, salesSnap, notificationsSnap, tokensSnap] =
    await Promise.all([
      shopRef.get(),
      shopRef.collection('reminderSettings').doc('default').get(),
      shopRef.collection('customers').get(),
      shopRef.collection('sales').get(),
      shopRef.collection('notifications').get(),
      shopRef.collection('fcmTokens').get(),
    ]);

  const ownerUid =
    (shopSnap.data()?.ownerUid as string | undefined) ||
    (settingsSnap.data()?.ownerUid as string | undefined) ||
    shopId;

  const rawSettings = (settingsSnap.data() || {}) as ReminderSettingsDoc;
  const enabled = rawSettings.enabled !== undefined ? Boolean(rawSettings.enabled) : true;
  const intervalDays = clampDays(rawSettings.intervalDays);

  const customers = customersSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<CustomerDoc, 'id'>),
  }));
  const sales = salesSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<SaleDoc, 'id'>),
  }));
  const existingNotifications = notificationsSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<NotificationDoc, 'id'>),
  }));

  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  const batch = db.batch();

  let clearedCount = 0;
  const dedupeKeys = new Set<string>();
  const activeCycles = new Set<string>();

  for (const notif of existingNotifications) {
    if (notif.dedupeKey) dedupeKeys.add(notif.dedupeKey);
    const cust = customerMap.get(notif.customerId);
    const balance = cust ? Number(cust.outstandingBalance || 0) : 0;

    if (notif.status === 'active' && balance <= 0) {
      clearedCount += 1;
      batch.update(shopRef.collection('notifications').doc(notif.id), {
        status: 'cleared',
        pendingAmount: 0,
        clearedAt: nowIso,
        updatedAt: nowIso,
      });
    } else if (notif.status === 'active') {
      activeCycles.add(`${notif.customerId}::${notif.intervalDays}::${notif.cycleNumber}`);
      activeCycles.add(`${notif.customerId}::${notif.dueDate.slice(0, 10)}`);
    }
  }

  const newlyCreated: NotificationDoc[] = [];

  if (enabled) {
    for (const customer of customers) {
      const balance = Math.round((Number(customer.outstandingBalance || 0) + Number.EPSILON) * 100) / 100;
      if (balance <= 0) continue;

      const anchorDate = computeOldestUnsettledAnchor(customer, sales);
      const anchorMs = parseMs(anchorDate) ?? nowMs;
      const daysElapsed = Math.floor(Math.max(0, nowMs - anchorMs) / DAY_MS);
      const cycleNumber = Math.floor(daysElapsed / intervalDays);
      if (cycleNumber < 1) continue;

      const dueDate = new Date(anchorMs + cycleNumber * intervalDays * DAY_MS).toISOString();
      const dedupeKey = `${customer.id}::${intervalDays}d::cycle-${cycleNumber}::${dueDate.slice(0, 10)}`;
      const cycleKey = `${customer.id}::${intervalDays}::${cycleNumber}`;
      const dayKey = `${customer.id}::${dueDate.slice(0, 10)}`;

      if (dedupeKeys.has(dedupeKey) || activeCycles.has(cycleKey) || activeCycles.has(dayKey)) {
        continue;
      }

      const notifRef = shopRef.collection('notifications').doc();
      const docData: NotificationDoc = {
        id: notifRef.id,
        shopId,
        ownerUid,
        customerId: customer.id,
        customerName: customer.name,
        pendingAmount: balance,
        dueDate,
        anchorDate,
        intervalDays,
        cycleNumber,
        dedupeKey,
        status: 'active',
        isRead: false,
        actionUrl: `/customers/${customer.id}`,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      batch.set(notifRef, docData);
      dedupeKeys.add(dedupeKey);
      activeCycles.add(cycleKey);
      activeCycles.add(dayKey);
      newlyCreated.push(docData);
    }
  }

  if (clearedCount > 0 || newlyCreated.length > 0) {
    await batch.commit();
  }

  // Send browser push notifications ONLY to the logged-in shopkeeper's registered FCM tokens (NEVER to customers)
  const shopkeeperTokens = tokensSnap.docs
    .map((d) => String(d.data()?.token || '').trim())
    .filter(Boolean);

  if (newlyCreated.length > 0 && shopkeeperTokens.length > 0 && rawSettings.browserPushEnabled !== false) {
    const messaging = getMessaging();
    for (const notif of newlyCreated) {
      await messaging.sendEachForMulticast({
        tokens: shopkeeperTokens,
        notification: {
          title: `Udhaar Due: ${notif.customerName}`,
          body: `Pending ₹${notif.pendingAmount} · Due ${notif.dueDate.slice(0, 10)}`,
        },
        data: {
          customerId: notif.customerId,
          actionUrl: notif.actionUrl,
          notificationId: notif.id,
        },
        webpush: {
          fcmOptions: {
            link: notif.actionUrl,
          },
        },
      });
    }
  }

  return { createdCount: newlyCreated.length, clearedCount };
}

/**
 * Scheduled Cloud Function: Runs every 24 hours across all shops to notify ONLY the shopkeeper
 * when any customer's Udhaar payment reaches its due interval (default 7 days).
 */
export const checkOverdueUdhaarReminders = onSchedule('every 24 hours', async () => {
  const shopsSnap = await db.collection('shops').get();
  for (const shopDoc of shopsSnap.docs) {
    await reconcileShopDueReminders(shopDoc.id);
  }
});

/**
 * Firestore Trigger: Automatically clears active reminders the moment a customer's
 * outstanding Udhaar balance is settled to 0.
 */
export const onCustomerBalanceChange = onDocumentWritten(
  'shops/{shopId}/customers/{customerId}',
  async (event) => {
    const shopId = event.params.shopId;
    const customerId = event.params.customerId;
    const afterData = event.data?.after.data() as CustomerDoc | undefined;
    const balance = afterData ? Number(afterData.outstandingBalance || 0) : 0;

    if (balance <= 0) {
      const activeSnap = await db
        .collection('shops')
        .doc(shopId)
        .collection('notifications')
        .where('customerId', '==', customerId)
        .where('status', '==', 'active')
        .get();

      if (!activeSnap.empty) {
        const nowIso = new Date().toISOString();
        const batch = db.batch();
        for (const docSnap of activeSnap.docs) {
          batch.update(docSnap.ref, {
            status: 'cleared',
            pendingAmount: 0,
            clearedAt: nowIso,
            updatedAt: nowIso,
          });
        }
        await batch.commit();
      }
    }
  }
);

/**
 * Callable Cloud Function: Lets the authenticated shopkeeper trigger an immediate due check
 * for their own shop only.
 */
export const syncShopDueRemindersNow = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Shopkeeper must be signed in.');
  }
  return reconcileShopDueReminders(request.auth.uid);
});

export { novaScanLookupBarcode } from './novaScan';
