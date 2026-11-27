"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.novaScanLookupBarcode = exports.syncShopDueRemindersNow = exports.onCustomerBalanceChange = exports.checkOverdueUdhaarReminders = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
const firestore_2 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INTERVAL_DAYS = 7;
function clampDays(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 1)
        return DEFAULT_INTERVAL_DAYS;
    return Math.min(365, Math.max(1, Math.round(num)));
}
function parseMs(iso) {
    if (!iso)
        return null;
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? ms : null;
}
function computeOldestUnsettledAnchor(customer, sales) {
    const balance = Number(customer.outstandingBalance || 0);
    const tranches = [];
    if ((customer.openingBalance || 0) > 0) {
        const ms = parseMs(customer.createdAt) ?? Date.now();
        tranches.push({
            amount: Number(customer.openingBalance),
            dateMs: ms,
            iso: new Date(ms).toISOString(),
        });
    }
    for (const sale of sales) {
        if (sale.customerId === customer.id &&
            sale.status !== 'cancelled' &&
            Number(sale.dueAmount || 0) > 0) {
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
        if (remainingToConsume <= 0.001)
            return tranche.iso;
        if (tranche.amount <= remainingToConsume + 0.001) {
            remainingToConsume -= tranche.amount;
        }
        else {
            return tranche.iso;
        }
    }
    return tranches[tranches.length - 1].iso;
}
async function reconcileShopDueReminders(shopId) {
    const shopRef = db.collection('shops').doc(shopId);
    const [shopSnap, settingsSnap, customersSnap, salesSnap, notificationsSnap, tokensSnap] = await Promise.all([
        shopRef.get(),
        shopRef.collection('reminderSettings').doc('default').get(),
        shopRef.collection('customers').get(),
        shopRef.collection('sales').get(),
        shopRef.collection('notifications').get(),
        shopRef.collection('fcmTokens').get(),
    ]);
    const ownerUid = shopSnap.data()?.ownerUid ||
        settingsSnap.data()?.ownerUid ||
        shopId;
    const rawSettings = (settingsSnap.data() || {});
    const enabled = rawSettings.enabled !== undefined ? Boolean(rawSettings.enabled) : true;
    const intervalDays = clampDays(rawSettings.intervalDays);
    const customers = customersSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
    }));
    const sales = salesSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
    }));
    const existingNotifications = notificationsSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
    }));
    const customerMap = new Map(customers.map((c) => [c.id, c]));
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();
    const batch = db.batch();
    let clearedCount = 0;
    const dedupeKeys = new Set();
    const activeCycles = new Set();
    for (const notif of existingNotifications) {
        if (notif.dedupeKey)
            dedupeKeys.add(notif.dedupeKey);
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
        }
        else if (notif.status === 'active') {
            activeCycles.add(`${notif.customerId}::${notif.intervalDays}::${notif.cycleNumber}`);
            activeCycles.add(`${notif.customerId}::${notif.dueDate.slice(0, 10)}`);
        }
    }
    const newlyCreated = [];
    if (enabled) {
        for (const customer of customers) {
            const balance = Math.round((Number(customer.outstandingBalance || 0) + Number.EPSILON) * 100) / 100;
            if (balance <= 0)
                continue;
            const anchorDate = computeOldestUnsettledAnchor(customer, sales);
            const anchorMs = parseMs(anchorDate) ?? nowMs;
            const daysElapsed = Math.floor(Math.max(0, nowMs - anchorMs) / DAY_MS);
            const cycleNumber = Math.floor(daysElapsed / intervalDays);
            if (cycleNumber < 1)
                continue;
            const dueDate = new Date(anchorMs + cycleNumber * intervalDays * DAY_MS).toISOString();
            const dedupeKey = `${customer.id}::${intervalDays}d::cycle-${cycleNumber}::${dueDate.slice(0, 10)}`;
            const cycleKey = `${customer.id}::${intervalDays}::${cycleNumber}`;
            const dayKey = `${customer.id}::${dueDate.slice(0, 10)}`;
            if (dedupeKeys.has(dedupeKey) || activeCycles.has(cycleKey) || activeCycles.has(dayKey)) {
                continue;
            }
            const notifRef = shopRef.collection('notifications').doc();
            const docData = {
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
        const messaging = (0, messaging_1.getMessaging)();
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
exports.checkOverdueUdhaarReminders = (0, scheduler_1.onSchedule)('every 24 hours', async () => {
    const shopsSnap = await db.collection('shops').get();
    for (const shopDoc of shopsSnap.docs) {
        await reconcileShopDueReminders(shopDoc.id);
    }
});
/**
 * Firestore Trigger: Automatically clears active reminders the moment a customer's
 * outstanding Udhaar balance is settled to 0.
 */
exports.onCustomerBalanceChange = (0, firestore_2.onDocumentWritten)('shops/{shopId}/customers/{customerId}', async (event) => {
    const shopId = event.params.shopId;
    const customerId = event.params.customerId;
    const afterData = event.data?.after.data();
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
});
/**
 * Callable Cloud Function: Lets the authenticated shopkeeper trigger an immediate due check
 * for their own shop only.
 */
exports.syncShopDueRemindersNow = (0, https_1.onCall)(async (request) => {
    if (!request.auth?.uid) {
        throw new https_1.HttpsError('unauthenticated', 'Shopkeeper must be signed in.');
    }
    return reconcileShopDueReminders(request.auth.uid);
});
var novaScan_1 = require("./novaScan");
Object.defineProperty(exports, "novaScanLookupBarcode", { enumerable: true, get: function () { return novaScan_1.novaScanLookupBarcode; } });
//# sourceMappingURL=index.js.map