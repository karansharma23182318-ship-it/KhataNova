import {
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { testFirestoreConnection } from '../firebase/firebase';
import {
  OperationType,
  handleFirestoreError,
  shopSubCollection,
} from '../firebase/firestore';
import type { DueReminderNotification, DueReminderSettings } from '../types/models';

export async function verifyFirestoreReady(): Promise<boolean> {
  const state = await testFirestoreConnection();
  return state.connected;
}

export async function syncReminderSettingsToFirestore(
  uid: string,
  settings: DueReminderSettings
): Promise<void> {
  const path = `shops/${uid}/reminderSettings/default`;
  try {
    const ref = doc(shopSubCollection(uid, 'reminderSettings'), 'default');
    await setDoc(
      ref,
      {
        enabled: Boolean(settings.enabled),
        intervalDays: Number(settings.intervalDays || 7),
        browserPushEnabled: Boolean(settings.browserPushEnabled),
        ownerUid: uid,
        updatedAt: settings.updatedAt || new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.WRITE, path);
    } catch {
      // Keep running smoothly via backend/RTDB/vault if Firestore rules are not deployed yet
    }
  }
}

export async function syncNotificationsToFirestore(
  uid: string,
  notifications: DueReminderNotification[]
): Promise<void> {
  if (!notifications.length) return;
  const path = `shops/${uid}/notifications`;
  try {
    const colRef = shopSubCollection(uid, 'notifications');
    const batch = writeBatch(colRef.firestore);
    for (const item of notifications.slice(0, 100)) {
      const ref = doc(colRef, item.id);
      batch.set(
        ref,
        {
          ...item,
          shopId: uid,
          ownerUid: uid,
        },
        { merge: true }
      );
    }
    await batch.commit();
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.WRITE, path);
    } catch {
      // Graceful fallback when Firestore permissions are restricted
    }
  }
}

export async function fetchNotificationsFromFirestore(
  uid: string
): Promise<DueReminderNotification[]> {
  const path = `shops/${uid}/notifications`;
  try {
    const q = query(shopSubCollection(uid, 'notifications'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as DueReminderNotification);
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.LIST, path);
    } catch {
      return [];
    }
  }
}

export function subscribeFirestoreNotifications(
  uid: string,
  onData: (items: DueReminderNotification[]) => void
): Unsubscribe {
  const path = `shops/${uid}/notifications`;
  const q = query(shopSubCollection(uid, 'notifications'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as DueReminderNotification);
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Non-fatal: in-app engine continues via Express API + RTDB
      }
    }
  );
}
