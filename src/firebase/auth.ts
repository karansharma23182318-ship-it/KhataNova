import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Unsubscribe,
  type User,
} from 'firebase/auth';
import { auth } from './firebase';
import type { Language } from '../types/models';

const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('profile');
googleProvider.addScope('email');
googleProvider.setCustomParameters({ prompt: 'select_account' });

export interface FormattedAuthError {
  code: string;
  message: string;
  canRetryWithRedirect: boolean;
}

export function formatFirebaseAuthError(
  error: unknown,
  language: Language = 'hi',
  hostname?: string
): FormattedAuthError {
  const errObj = error as { code?: string; message?: string } | null;
  const code = errObj?.code || '';
  const rawMessage = error instanceof Error ? error.message : String(error || '');
  const host = hostname || (typeof window !== 'undefined' ? window.location.hostname : '');

  if (code === 'auth/unauthorized-domain' || rawMessage.includes('auth/unauthorized-domain')) {
    return {
      code: 'auth/unauthorized-domain',
      canRetryWithRedirect: false,
      message:
        language === 'hi'
          ? `यह डोमेन (${host || 'current host'}) Firebase में अधिकृत नहीं है। Firebase Console → Authentication → Settings → Authorized domains में "${host}" जोड़ें।`
          : `This domain (${host || 'current host'}) is not authorized in Firebase. Add "${host}" under Firebase Console → Authentication → Settings → Authorized domains.`,
    };
  }

  if (code === 'auth/popup-blocked' || rawMessage.includes('auth/popup-blocked')) {
    return {
      code: 'auth/popup-blocked',
      canRetryWithRedirect: true,
      message:
        language === 'hi'
          ? 'ब्राउज़र ने Google लॉगिन पॉपअप को ब्लॉक कर दिया है। पॉपअप की अनुमति दें या नीचे Redirect लॉगिन विकल्प आज़माएं।'
          : 'Your browser blocked the Google Sign-In popup. Allow popups for this site or try Redirect Sign-In below.',
    };
  }

  if (code === 'auth/popup-closed-by-user' || rawMessage.includes('auth/popup-closed-by-user')) {
    return {
      code: 'auth/popup-closed-by-user',
      canRetryWithRedirect: true,
      message:
        language === 'hi'
          ? 'Google लॉगिन पूरा होने से पहले पॉपअप बंद कर दिया गया। कृपया दोबारा प्रयास करें।'
          : 'Google Sign-In popup was closed before completing login. Please try again.',
    };
  }

  if (code === 'auth/operation-not-allowed' || rawMessage.includes('auth/operation-not-allowed')) {
    return {
      code: 'auth/operation-not-allowed',
      canRetryWithRedirect: false,
      message:
        language === 'hi'
          ? 'Firebase Console में Google Sign-In चालू नहीं है। Authentication → Sign-in method में Google को Enable करें।'
          : 'Google Sign-In is not enabled in Firebase Console. Enable Google under Authentication → Sign-in method.',
    };
  }

  if (code === 'auth/network-request-failed' || rawMessage.includes('auth/network-request-failed')) {
    return {
      code: 'auth/network-request-failed',
      canRetryWithRedirect: false,
      message:
        language === 'hi'
          ? 'नेटवर्क समस्या के कारण Google लॉगिन नहीं हो सका। इंटरनेट जांचें और पुनः प्रयास करें।'
          : 'Network error during Google Sign-In. Please check your internet connection and try again.',
    };
  }

  if (
    code === 'auth/operation-not-supported-in-this-environment' ||
    rawMessage.includes('operation-not-supported-in-this-environment')
  ) {
    return {
      code: 'auth/operation-not-supported-in-this-environment',
      canRetryWithRedirect: true,
      message:
        language === 'hi'
          ? 'इस ब्राउज़र मोड में पॉपअप समर्थित नहीं है। कृपया नया टैब खोलें या Redirect लॉगिन आज़माएं।'
          : 'Popup sign-in is not supported in this embedded browser context. Open in a full tab or try Redirect Sign-In.',
    };
  }

  return {
    code: code || 'auth/unknown',
    canRetryWithRedirect: false,
    message:
      rawMessage ||
      (language === 'hi'
        ? 'Google लॉगिन विफल रहा। कृपया पुनः प्रयास करें।'
        : 'Google Sign-In failed. Please try again.'),
  };
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signInWithGoogleRedirect(): Promise<void> {
  await signInWithRedirect(auth, googleProvider);
}

export async function consumeGoogleRedirectResult(): Promise<User | null> {
  const result = await getRedirectResult(auth);
  return result?.user ?? null;
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

export function subscribeToAuthState(callback: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, callback);
}
