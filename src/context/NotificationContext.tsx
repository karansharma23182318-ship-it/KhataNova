import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { testFirestoreConnection } from '../firebase/firebase';
import { subscribeFirestoreNotifications } from '../services/firestoreNotificationSync';
import { readShopVault } from '../services/localVault';
import {
  clearClearedNotificationHistory,
  dispatchShopkeeperBrowserNotification,
  dispatchTestShopkeeperNotification,
  fetchAndReconcileNotifications,
  getBrowserNotificationPermission,
  markShopkeeperNotificationRead,
  registerNotificationServiceWorker,
  requestBrowserNotificationPermission,
  saveDueReminderSettings,
} from '../services/notificationService';
import type { DueReminderNotification, DueReminderSettings } from '../types/models';
import {
  createDefaultReminderSettings,
  type CustomerDueEvaluation,
} from '../utils/dueReminders';
import { useAuth } from './AuthContext';
import { useLanguage } from './LanguageContext';

interface NotificationContextValue {
  settings: DueReminderSettings;
  notifications: DueReminderNotification[];
  evaluations: CustomerDueEvaluation[];
  unreadCount: number;
  activeDueCount: number;
  browserPermission: NotificationPermission | 'unsupported';
  loading: boolean;
  refreshNotifications: (options?: { notifyBrowser?: boolean }) => Promise<void>;
  updateReminderSettings: (patch: Partial<DueReminderSettings>) => Promise<void>;
  markNotificationAsRead: (notificationId?: string) => Promise<void>;
  clearResolvedHistory: () => Promise<void>;
  enableBrowserPush: () => Promise<NotificationPermission | 'unsupported'>;
  sendTestNotification: () => Promise<boolean>;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

const AUTO_SCAN_INTERVAL_MS = 5 * 60 * 1000;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [settings, setSettings] = useState<DueReminderSettings>(() =>
    createDefaultReminderSettings()
  );
  const [notifications, setNotifications] = useState<DueReminderNotification[]>([]);
  const [evaluations, setEvaluations] = useState<CustomerDueEvaluation[]>([]);
  const [loading, setLoading] = useState(false);
  const [browserPermission, setBrowserPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => getBrowserNotificationPermission());

  const refreshNotifications = useCallback(
    async (options: { notifyBrowser?: boolean } = { notifyBrowser: true }) => {
      if (!user) {
        setNotifications([]);
        setEvaluations([]);
        setSettings(createDefaultReminderSettings());
        return;
      }

      setLoading(true);
      try {
        const res = await fetchAndReconcileNotifications(user.uid);
        setSettings(res.settings);
        setNotifications(res.notifications);
        setEvaluations(res.evaluations);

        if (
          options.notifyBrowser !== false &&
          res.settings.enabled &&
          res.settings.browserPushEnabled &&
          res.newlyCreated.length > 0 &&
          getBrowserNotificationPermission() === 'granted'
        ) {
          for (const item of res.newlyCreated) {
            await dispatchShopkeeperBrowserNotification(user.uid, item, language);
          }
        }
      } finally {
        setLoading(false);
      }
    },
    [user, language]
  );

  // Hydrate immediately from per-UID localVault, validate Firestore connection, & run initial scan
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setEvaluations([]);
      setSettings(createDefaultReminderSettings());
      return;
    }

    const vault = readShopVault(user.uid);
    if (vault) {
      setSettings(vault.dueReminderSettings || createDefaultReminderSettings());
      setNotifications(vault.dueNotifications || []);
    }

    void testFirestoreConnection();
    if (getBrowserNotificationPermission() === 'granted') {
      void registerNotificationServiceWorker();
    }

    void refreshNotifications({ notifyBrowser: true });

    const unsubFirestore = subscribeFirestoreNotifications(user.uid, (cloudItems) => {
      if (cloudItems.length > 0) {
        setNotifications((prev) => {
          const map = new Map(prev.map((n) => [n.id, n]));
          for (const item of cloudItems) {
            const existing = map.get(item.id);
            if (!existing || item.updatedAt > existing.updatedAt) {
              map.set(item.id, item);
            }
          }
          return Array.from(map.values()).sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt)
          );
        });
      }
    });

    const handleDataChanged = () => {
      void refreshNotifications({ notifyBrowser: true });
    };
    window.addEventListener('khatanova:data-changed', handleDataChanged);

    const timer = window.setInterval(() => {
      void refreshNotifications({ notifyBrowser: true });
    }, AUTO_SCAN_INTERVAL_MS);

    return () => {
      unsubFirestore();
      window.removeEventListener('khatanova:data-changed', handleDataChanged);
      window.clearInterval(timer);
    };
  }, [user, refreshNotifications]);

  const updateReminderSettings = useCallback(
    async (patch: Partial<DueReminderSettings>) => {
      if (!user) return;
      const res = await saveDueReminderSettings(user.uid, patch);
      setSettings(res.settings);
      setNotifications(res.notifications);
      setEvaluations(res.evaluations);

      if (
        res.settings.enabled &&
        res.settings.browserPushEnabled &&
        res.newlyCreated.length > 0 &&
        getBrowserNotificationPermission() === 'granted'
      ) {
        for (const item of res.newlyCreated) {
          await dispatchShopkeeperBrowserNotification(user.uid, item, language);
        }
      }
    },
    [user, language]
  );

  const markNotificationAsRead = useCallback(
    async (notificationId?: string) => {
      if (!user) return;
      const now = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((n) =>
          !notificationId || n.id === notificationId
            ? { ...n, isRead: true, readAt: n.readAt || now, updatedAt: now }
            : n
        )
      );
      const updated = await markShopkeeperNotificationRead(user.uid, notificationId);
      setNotifications(updated);
    },
    [user]
  );

  const clearResolvedHistory = useCallback(async () => {
    if (!user) return;
    const updated = await clearClearedNotificationHistory(user.uid);
    setNotifications(updated);
  }, [user]);

  const enableBrowserPush = useCallback(async () => {
    const permission = await requestBrowserNotificationPermission();
    setBrowserPermission(permission);
    if (permission === 'granted' && user) {
      await updateReminderSettings({ browserPushEnabled: true });
    } else if (permission === 'denied' && user) {
      await updateReminderSettings({ browserPushEnabled: false });
    }
    return permission;
  }, [user, updateReminderSettings]);

  const sendTestNotification = useCallback(async () => {
    const permission = await requestBrowserNotificationPermission();
    setBrowserPermission(permission);
    if (permission !== 'granted') return false;
    return dispatchTestShopkeeperNotification(language);
  }, [language]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead && n.status === 'active').length,
    [notifications]
  );

  const activeDueCount = useMemo(
    () => notifications.filter((n) => n.status === 'active').length,
    [notifications]
  );

  return (
    <NotificationContext.Provider
      value={{
        settings,
        notifications,
        evaluations,
        unreadCount,
        activeDueCount,
        browserPermission,
        loading,
        refreshNotifications,
        updateReminderSettings,
        markNotificationAsRead,
        clearResolvedHistory,
        enableBrowserPush,
        sendTestNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return ctx;
}
