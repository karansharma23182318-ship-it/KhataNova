import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type Auth,
} from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  type Firestore,
} from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

export const firebaseConfig = {
  apiKey: 'AIzaSyAnH7-JStNhPlI1F270_vStZnK3EvmAXBY',
  authDomain: 'khatanova-f42f1.firebaseapp.com',
  databaseURL: 'https://khatanova-f42f1-default-rtdb.firebaseio.com',
  projectId: 'khatanova-f42f1',
  storageBucket: 'khatanova-f42f1.firebasestorage.app',
  messagingSenderId: '264098174562',
  appId: '1:264098174562:web:2e5c811e54234dce1c633b',
  measurementId: 'G-BCY5NBVVEF',
};

export const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);

// Persist Google sign-in across reloads in local browser storage
if (typeof window !== 'undefined') {
  void setPersistence(auth, browserLocalPersistence).catch(() => {
    // Fallback to default persistence if restricted by browser storage settings
  });
}

function createFirestoreInstance(firebaseApp: FirebaseApp): Firestore {
  try {
    return initializeFirestore(firebaseApp, {
      experimentalForceLongPolling: true,
      ignoreUndefinedProperties: true,
    });
  } catch {
    return getFirestore(firebaseApp);
  }
}

export const db: Firestore = createFirestoreInstance(app);
export const storage: FirebaseStorage = getStorage(app);

export interface FirestoreConnectionState {
  checked: boolean;
  connected: boolean;
  offline: boolean;
  message?: string;
}

let lastConnectionState: FirestoreConnectionState = {
  checked: false,
  connected: true,
  offline: false,
};

export function getLastFirestoreConnectionState(): FirestoreConnectionState {
  return lastConnectionState;
}

export async function testFirestoreConnection(): Promise<FirestoreConnectionState> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    lastConnectionState = { checked: true, connected: true, offline: false };
    return lastConnectionState;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const offline =
      msg.toLowerCase().includes('the client is offline') ||
      msg.toLowerCase().includes('unavailable');
    const permissionError = msg.toLowerCase().includes('permission');
    lastConnectionState = {
      checked: true,
      connected: permissionError,
      offline,
      message: msg,
    };
    return lastConnectionState;
  }
}
