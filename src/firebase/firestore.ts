import { collection, doc, type CollectionReference, type DocumentReference } from 'firebase/firestore';
import { auth, db } from './firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function isOfflineFirestoreError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  return lower.includes('the client is offline') || lower.includes('unavailable') || lower.includes('network');
}

export function isPermissionFirestoreError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  return lower.includes('missing or insufficient permissions') || lower.includes('permission-denied');
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const msg = error instanceof Error ? error.message : String(error);

  if (isOfflineFirestoreError(error)) {
    throw new Error('Unable to reach Firestore right now. Please check your internet connection and try again.');
  }

  if (isPermissionFirestoreError(error)) {
    const errInfo: FirestoreErrorInfo = {
      error: msg,
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        tenantId: auth.currentUser?.tenantId,
        providerInfo:
          auth.currentUser?.providerData?.map((provider) => ({
            providerId: provider.providerId,
            email: provider.email,
          })) || [],
      },
      operationType,
      path,
    };
    console.error('Firestore Permission Error:', JSON.stringify(errInfo));
    throw new Error('Permission denied while accessing database. Please verify Firebase Firestore Rules.');
  }

  throw error instanceof Error ? error : new Error(msg);
}

export function withFirestoreTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 12000,
  message = 'Request timed out while saving to Firestore. Please check your internet connection and try again.'
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
    promise
      .then((val) => {
        window.clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        window.clearTimeout(timer);
        reject(err);
      });
  });
}

export const userDocRef = (uid: string): DocumentReference => doc(db, 'users', uid);
export const shopDocRef = (shopId: string): DocumentReference => doc(db, 'shops', shopId);
export const shopSubCollection = (shopId: string, name: string): CollectionReference =>
  collection(db, 'shops', shopId, name);
