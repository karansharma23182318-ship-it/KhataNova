import type { DueReminderNotification, DueReminderSettings } from '../types/models';
import {
  reconcileDueNotifications,
  type CustomerDueEvaluation,
} from '../utils/dueReminders';
import { formatINR } from '../utils/finance';
import { shopApiFetch } from './apiClient';
import {
  syncNotificationsToFirestore,
  syncReminderSettingsToFirestore,
} from './firestoreNotificationSync';
import { readShopVault, writeShopVault } from './localVault';

export interface NotificationSyncResponse {
  settings: DueReminderSettings;
  notifications: DueReminderNotification[];
  newlyCreated: DueReminderNotification[];
  autoClearedCount: number;
  evaluations: CustomerDueEvaluation[];
}

const PUSHED_CACHE_KEY = 'khatanova_browser_pushed_ids_v1:';

export async function fetchAndReconcileNotifications(
  uid: string
): Promise<NotificationSyncResponse> {
  try {
    const res = await shopApiFetch<NotificationSyncResponse>('/api/shop/notifications', {
      method: 'GET',
    });
    writeShopVault(
      uid,
      {
        dueReminderSettings: res.settings,
        dueNotifications: res.notifications,
      },
      { silent: true }
    );
    void syncReminderSettingsToFirestore(uid, res.settings);
    if (res.newlyCreated.length > 0 || res.autoClearedCount > 0) {
      void syncNotificationsToFirestore(uid, res.notifications);
    }
    return res;
  } catch {
    const vault = readShopVault(uid);
    const localResult = reconcileDueNotifications({
      shopId: uid,
      ownerUid: uid,
      customers: vault?.customers || [],
      sales: vault?.sales || [],
      ledger: vault?.ledger || [],
      settings: vault?.dueReminderSettings || {
        enabled: true,
        intervalDays: 7,
        browserPushEnabled: false,
        updatedAt: '',
      },
      existingNotifications: vault?.dueNotifications || [],
    });
    writeShopVault(
      uid,
      {
        dueNotifications: localResult.nextNotifications,
      },
      { silent: true }
    );
    return {
      settings: vault?.dueReminderSettings || {
        enabled: true,
        intervalDays: 7,
        browserPushEnabled: false,
        updatedAt: '',
      },
      notifications: localResult.nextNotifications,
      newlyCreated: localResult.newlyCreated,
      autoClearedCount: localResult.autoClearedCount,
      evaluations: localResult.evaluations,
    };
  }
}

export async function saveDueReminderSettings(
  uid: string,
  patch: Partial<DueReminderSettings>
): Promise<NotificationSyncResponse> {
  const res = await shopApiFetch<NotificationSyncResponse>('/api/shop/notifications/settings', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
  writeShopVault(
    uid,
    {
      dueReminderSettings: res.settings,
      dueNotifications: res.notifications,
    },
    { silent: true }
  );
  void syncReminderSettingsToFirestore(uid, res.settings);
  void syncNotificationsToFirestore(uid, res.notifications);
  return res;
}

export async function markShopkeeperNotificationRead(
  uid: string,
  notificationId?: string
): Promise<DueReminderNotification[]> {
  const res = await shopApiFetch<{ notifications: DueReminderNotification[] }>(
    '/api/shop/notifications/read',
    {
      method: 'POST',
      body: JSON.stringify(notificationId ? { notificationId } : {}),
    }
  );
  writeShopVault(uid, { dueNotifications: res.notifications }, { silent: true });
  void syncNotificationsToFirestore(uid, res.notifications);
  return res.notifications;
}

export async function clearClearedNotificationHistory(
  uid: string
): Promise<DueReminderNotification[]> {
  const res = await shopApiFetch<{ notifications: DueReminderNotification[] }>(
    '/api/shop/notifications/cleared',
    {
      method: 'DELETE',
    }
  );
  writeShopVault(uid, { dueNotifications: res.notifications }, { silent: true });
  return res.notifications;
}

export function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function registerNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    return await navigator.serviceWorker.register('/sw-notifications.js');
  } catch {
    return null;
  }
}

export async function requestBrowserNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') {
    await registerNotificationServiceWorker();
    return 'granted';
  }
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    await registerNotificationServiceWorker();
  }
  return permission;
}

function readPushedIds(uid: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(`${PUSHED_CACHE_KEY}${uid}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function markIdPushed(uid: string, dedupeKey: string): void {
  try {
    const set = readPushedIds(uid);
    set.add(dedupeKey);
    const trimmed = Array.from(set).slice(-200);
    window.localStorage.setItem(`${PUSHED_CACHE_KEY}${uid}`, JSON.stringify(trimmed));
  } catch {
    // ignore storage errors
  }
}

/**
 * Displays a browser push notification strictly to the logged-in shopkeeper
 * on this device (never sent to customers).
 */
export async function dispatchShopkeeperBrowserNotification(
  uid: string,
  notification: DueReminderNotification,
  language: 'hi' | 'en',
  onClickNavigate?: (path: string) => void
): Promise<boolean> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return false;
  }
  if (Notification.permission !== 'granted') {
    return false;
  }
  const pushed = readPushedIds(uid);
  if (pushed.has(notification.dedupeKey)) {
    return false;
  }

  const dueStr = new Date(notification.dueDate).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const title =
    language === 'hi'
      ? `बकाया रिमाइंडर: ${notification.customerName}`
      : `Udhaar Due: ${notification.customerName}`;
  const body =
    language === 'hi'
      ? `बाकी राशि: ${formatINR(notification.pendingAmount)} · देय तारीख: ${dueStr}`
      : `Pending: ${formatINR(notification.pendingAmount)} · Due: ${dueStr}`;

  markIdPushed(uid, notification.dedupeKey);

  try {
    const reg = await registerNotificationServiceWorker();
    if (reg && 'showNotification' in reg) {
      await reg.showNotification(title, {
        body,
        icon: '/logo.svg',
        badge: '/logo.svg',
        tag: notification.dedupeKey,
        data: { actionUrl: notification.actionUrl },
      });
      return true;
    }

    const browserNotif = new Notification(title, {
      body,
      icon: '/logo.svg',
      tag: notification.dedupeKey,
    });
    browserNotif.onclick = () => {
      window.focus();
      browserNotif.close();
      if (onClickNavigate) {
        onClickNavigate(notification.actionUrl);
      }
    };
    return true;
  } catch {
    return false;
  }
}

export async function dispatchTestShopkeeperNotification(
  language: 'hi' | 'en'
): Promise<boolean> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return false;
  }
  if (Notification.permission !== 'granted') {
    return false;
  }
  const title =
    language === 'hi'
      ? 'KhataNova स्मार्ट रिमाइंडर सक्रिय है'
      : 'KhataNova Smart Reminders Active';
  const body =
    language === 'hi'
      ? 'ग्राहकों के बकाया होने पर केवल आपको (दुकानदार को) यहाँ सूचना मिलेगी।'
      : 'You (the shopkeeper only) will receive browser alerts here when customer Udhaar becomes due.';
  try {
    const reg = await registerNotificationServiceWorker();
    if (reg && 'showNotification' in reg) {
      await reg.showNotification(title, {
        body,
        icon: '/logo.svg',
        badge: '/logo.svg',
        tag: `khatanova-test-${Date.now()}`,
        data: { actionUrl: '/notifications' },
      });
      return true;
    }
    const n = new Notification(title, { body, icon: '/logo.svg' });
    setTimeout(() => n.close(), 6000);
    return true;
  } catch {
    return false;
  }
}
