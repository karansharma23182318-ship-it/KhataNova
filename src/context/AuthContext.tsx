import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  consumeGoogleRedirectResult,
  formatFirebaseAuthError,
  logoutUser,
  signInWithGoogle,
  signInWithGoogleRedirect,
  subscribeToAuthState,
} from '../firebase/auth';
import {
  clearLastActiveUid,
  readRateBook,
  readShopVault,
  saveLastActiveUid,
  writeRateBook,
  writeShopVault,
  type ShopVaultSnapshot,
} from '../services/localVault';
import type { RateBookItem } from '../utils/calculator';
import { shopApiFetch } from '../services/apiClient';
import { mirrorShopProfileToFirestore } from '../services/firebaseReminderData';
import { isEffectiveProMode, isPremiumPlan } from '../config/planConfig';
import type { ShopProfile, UserProfile } from '../types/models';
import { useLanguage } from './LanguageContext';

interface AuthContextValue {
  user: User | null;
  userProfile: UserProfile | null;
  shopProfile: ShopProfile | null;
  hasPremierAccess: boolean;
  isProMode: boolean;
  isSuspended: boolean;
  authReady: boolean;
  authLoading: boolean;
  authError: string | null;
  canRetryRedirect: boolean;
  profileWarning: string | null;
  loginWithGoogle: () => Promise<boolean>;
  loginWithGoogleRedirect: () => Promise<void>;
  clearAuthError: () => void;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  toggleProMode: (nextEnabled?: boolean) => Promise<void>;
  saveShopSetup: (
    input: Omit<ShopProfile, 'id' | 'ownerUid' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function buildFallbackProfile(firebaseUser: User, lang: 'hi' | 'en'): UserProfile {
  const now = new Date().toISOString();
  return {
    uid: firebaseUser.uid,
    displayName: firebaseUser.displayName || 'Shopkeeper',
    email: firebaseUser.email || '',
    ...(firebaseUser.photoURL ? { photoURL: firebaseUser.photoURL } : {}),
    ...(firebaseUser.phoneNumber ? { phoneNumber: firebaseUser.phoneNumber } : {}),
    role: 'shopkeeper',
    language: lang,
    subscriptionStatus: 'free',
    accountStatus: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { language, setLanguage } = useLanguage();
  const languageRef = React.useRef(language);
  languageRef.current = language;

  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [shopProfile, setShopProfile] = useState<ShopProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [canRetryRedirect, setCanRetryRedirect] = useState(false);
  const [profileWarning, setProfileWarning] = useState<string | null>(null);

  const syncInFlightRef = React.useRef<{ uid: string; promise: Promise<void> } | null>(null);
  const lastSyncAtRef = React.useRef<number>(0);

  const loadProfiles = useCallback(
    async (firebaseUser: User) => {
      if (syncInFlightRef.current && syncInFlightRef.current.uid === firebaseUser.uid) {
        return syncInFlightRef.current.promise;
      }

      const task = (async () => {
        const lang = languageRef.current;
        const fallback = buildFallbackProfile(firebaseUser, lang);
        const cachedVault = readShopVault(firebaseUser.uid);
        setProfileWarning(null);
        saveLastActiveUid(firebaseUser.uid);

        // Hydrate immediately from per-UID local vault so UI never loses Premier/Free state across app close/reopen
        if (cachedVault?.userProfile) {
          setUserProfile(cachedVault.userProfile);
        }
        if (cachedVault?.shopProfile) {
          setShopProfile(cachedVault.shopProfile);
        }

        try {
          const idToken = await firebaseUser.getIdToken();
          const synced = await shopApiFetch<{
            userProfile: UserProfile;
            shopProfile: ShopProfile | null;
            customers: ShopVaultSnapshot['customers'];
            sales: ShopVaultSnapshot['sales'];
            payments: ShopVaultSnapshot['payments'];
            ledger: ShopVaultSnapshot['ledger'];
            dueReminderSettings?: ShopVaultSnapshot['dueReminderSettings'];
            dueNotifications?: ShopVaultSnapshot['dueNotifications'];
            novaProducts?: ShopVaultSnapshot['novaProducts'];
            rateBook?: RateBookItem[];
          }>(
            '/api/shop/sync',
            {
              method: 'POST',
              body: JSON.stringify({
                shopProfile: cachedVault?.shopProfile || null,
                customers: cachedVault?.customers || [],
                sales: cachedVault?.sales || [],
                payments: cachedVault?.payments || [],
                ledger: cachedVault?.ledger || [],
                dueReminderSettings: cachedVault?.dueReminderSettings || undefined,
                dueNotifications: cachedVault?.dueNotifications || [],
                novaProducts: cachedVault?.novaProducts || [],
                rateBook: readRateBook(firebaseUser.uid),
              }),
            },
            idToken
          );

          // Never downgrade a locally cached Premier user back to fallback Free on partial responses
          setUserProfile(synced.userProfile);
          setShopProfile(synced.shopProfile);
          if (synced.shopProfile) {
            void mirrorShopProfileToFirestore(firebaseUser.uid, synced.shopProfile);
          }
          if (Array.isArray(synced.rateBook) && synced.rateBook.length > 0) {
            writeRateBook(firebaseUser.uid, synced.rateBook);
          }
          writeShopVault(
            firebaseUser.uid,
            {
              userProfile: synced.userProfile,
              shopProfile: synced.shopProfile,
              customers: synced.customers,
              sales: synced.sales,
              payments: synced.payments,
              ledger: synced.ledger,
              ...(synced.dueReminderSettings
                ? { dueReminderSettings: synced.dueReminderSettings }
                : {}),
              ...(synced.dueNotifications ? { dueNotifications: synced.dueNotifications } : {}),
              ...(synced.novaProducts ? { novaProducts: synced.novaProducts } : {}),
            },
            { silent: true }
          );
          lastSyncAtRef.current = Date.now();

          if (synced.userProfile.language === 'hi' || synced.userProfile.language === 'en') {
            setLanguage(synced.userProfile.language);
          }
        } catch (err) {
          if (!cachedVault?.userProfile) {
            setUserProfile(fallback);
          }
          setProfileWarning(err instanceof Error ? err.message : 'Unable to sync shop profile.');
        }
      })();

      const activeTask = { uid: firebaseUser.uid, promise: task };
      syncInFlightRef.current = activeTask;
      try {
        await task;
      } finally {
        if (syncInFlightRef.current === activeTask) {
          syncInFlightRef.current = null;
        }
      }
    },
    [setLanguage]
  );

  useEffect(() => {
    void consumeGoogleRedirectResult().catch((err) => {
      const formatted = formatFirebaseAuthError(err, languageRef.current);
      setAuthError(formatted.message);
      setCanRetryRedirect(formatted.canRetryWithRedirect);
    });

    const unsubscribe = subscribeToAuthState(async (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        setAuthError(null);
        setCanRetryRedirect(false);
        const cachedVault = readShopVault(nextUser.uid);
        if (cachedVault?.userProfile) {
          setUserProfile(cachedVault.userProfile);
          if (cachedVault.shopProfile) {
            setShopProfile(cachedVault.shopProfile);
          }
          setAuthReady(true);
          void loadProfiles(nextUser);
        } else {
          await loadProfiles(nextUser);
          setAuthReady(true);
        }
      } else {
        setUserProfile(null);
        setShopProfile(null);
        setProfileWarning(null);
        setAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, [loadProfiles]);

  // Continuously sync local mutations (sales, customers, rateBook, settings) and refresh on app resume
  useEffect(() => {
    if (!user) return;

    let debounceTimer: number | undefined;
    const handleDataChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ uid?: string }>).detail;
      if (detail?.uid && detail.uid !== user.uid) return;
      if (debounceTimer !== undefined) {
        window.clearTimeout(debounceTimer);
      }
      debounceTimer = window.setTimeout(() => {
        void loadProfiles(user);
      }, 1200);
    };

    const handleResumeSync = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      if (Date.now() - lastSyncAtRef.current < 20_000) return;
      void loadProfiles(user);
    };

    window.addEventListener('khatanova:data-changed', handleDataChanged as EventListener);
    window.addEventListener('focus', handleResumeSync);
    document.addEventListener('visibilitychange', handleResumeSync);

    return () => {
      if (debounceTimer !== undefined) {
        window.clearTimeout(debounceTimer);
      }
      window.removeEventListener('khatanova:data-changed', handleDataChanged as EventListener);
      window.removeEventListener('focus', handleResumeSync);
      document.removeEventListener('visibilitychange', handleResumeSync);
    };
  }, [user, loadProfiles]);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
    setCanRetryRedirect(false);
  }, []);

  const loginWithGoogle = useCallback(async (): Promise<boolean> => {
    setAuthLoading(true);
    setAuthError(null);
    setCanRetryRedirect(false);
    try {
      await signInWithGoogle();
      return true;
    } catch (err) {
      const formatted = formatFirebaseAuthError(err, language);
      setAuthError(formatted.message);
      setCanRetryRedirect(formatted.canRetryWithRedirect);
      return false;
    } finally {
      setAuthLoading(false);
    }
  }, [language]);

  const loginWithGoogleRedirect = useCallback(async () => {
    setAuthLoading(true);
    setAuthError(null);
    setCanRetryRedirect(false);
    try {
      await signInWithGoogleRedirect();
    } catch (err) {
      const formatted = formatFirebaseAuthError(err, language);
      setAuthError(formatted.message);
      setAuthLoading(false);
    }
  }, [language]);

  const logout = useCallback(async () => {
    setAuthLoading(true);
    try {
      await logoutUser();
      clearLastActiveUid();
      syncInFlightRef.current = null;
      lastSyncAtRef.current = 0;
      // Keep per-UID persistent local vault untouched so logging back in restores all records cleanly
      setUserProfile(null);
      setShopProfile(null);
      setProfileWarning(null);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await loadProfiles(user);
    }
  }, [user, loadProfiles]);

  const hasPremierAccess = isPremiumPlan(userProfile?.subscriptionStatus);
  const isProMode = isEffectiveProMode(userProfile);
  const isSuspended = userProfile?.accountStatus === 'suspended';

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.plan = isProMode ? 'pro' : 'free';
    }
  }, [isProMode]);

  const toggleProMode = useCallback(
    async (nextEnabled?: boolean) => {
      if (!user || !userProfile || !isPremiumPlan(userProfile.subscriptionStatus)) {
        throw new Error('Premier Mode switch is only available for active Premier members.');
      }
      const prevProfile = userProfile;
      const target = typeof nextEnabled === 'boolean' ? nextEnabled : !isEffectiveProMode(userProfile);
      const optimistic: UserProfile = {
        ...userProfile,
        proModeEnabled: target,
        updatedAt: new Date().toISOString(),
      };
      setUserProfile(optimistic);
      writeShopVault(user.uid, { userProfile: optimistic }, { silent: true });

      try {
        const idToken = await user.getIdToken();
        const res = await shopApiFetch<{ userProfile: UserProfile }>(
          '/api/shop/pro-mode',
          {
            method: 'PUT',
            body: JSON.stringify({ enabled: target }),
          },
          idToken
        );
        setUserProfile(res.userProfile);
        writeShopVault(user.uid, { userProfile: res.userProfile }, { silent: true });
      } catch (err) {
        setUserProfile(prevProfile);
        writeShopVault(user.uid, { userProfile: prevProfile }, { silent: true });
        throw err;
      }
    },
    [user, userProfile]
  );

  const saveShopSetup = useCallback(
    async (input: Omit<ShopProfile, 'id' | 'ownerUid' | 'createdAt' | 'updatedAt'>) => {
      if (!user) throw new Error('Please sign in with Google first.');
      const idToken = await user.getIdToken();
      const res = await shopApiFetch<{
        userProfile: UserProfile;
        shopProfile: ShopProfile;
      }>(
        '/api/shop/setup',
        {
          method: 'PUT',
          body: JSON.stringify({
            ownerName: (input.ownerName || '').trim(),
            shopName: input.shopName.trim(),
            phoneNumber: input.phoneNumber.trim(),
            whatsappNumber: (input.whatsappNumber || input.phoneNumber).trim(),
            businessType: input.businessType.trim(),
            address: input.address.trim(),
            gstNumber: (input.gstNumber || '').trim(),
            email: (input.email || '').trim(),
            aboutBusiness: (input.aboutBusiness || '').trim(),
            ...(input.logoUrl ? { logoUrl: input.logoUrl } : {}),
            ...(input.paymentUpiId !== undefined
              ? { paymentUpiId: input.paymentUpiId.trim() }
              : {}),
            ...(input.paymentQrUrl !== undefined
              ? { paymentQrUrl: input.paymentQrUrl }
              : {}),
            stockManagementEnabled: Boolean(input.stockManagementEnabled),
            reminderEnabled: Boolean(input.reminderEnabled),
            reminderIntervalDays: Number(input.reminderIntervalDays || 7),
          }),
        },
        idToken
      );

      setShopProfile(res.shopProfile);
      setUserProfile(res.userProfile);
      void mirrorShopProfileToFirestore(user.uid, res.shopProfile);
      writeShopVault(user.uid, {
        userProfile: res.userProfile,
        shopProfile: res.shopProfile,
      });
      setProfileWarning(null);
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        shopProfile,
        hasPremierAccess,
        isProMode,
        isSuspended,
        authReady,
        authLoading,
        authError,
        canRetryRedirect,
        profileWarning,
        loginWithGoogle,
        loginWithGoogleRedirect,
        clearAuthError,
        logout,
        refreshProfile,
        toggleProMode,
        saveShopSetup,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
