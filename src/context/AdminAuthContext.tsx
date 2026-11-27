import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

interface AdminStatusResponse {
  envConfigured: boolean;
  claimed: boolean;
  needsClaim: boolean;
}

interface AdminAuthActionResult {
  ok: boolean;
  error?: string;
  retryAfterSeconds?: number;
}

interface AdminAuthContextValue {
  adminToken: string | null;
  isAdminAuthenticated: boolean;
  statusLoaded: boolean;
  needsClaim: boolean;
  envConfigured: boolean;
  adminLoading: boolean;
  adminError: string | null;
  retryAfterSeconds: number;
  refreshAdminStatus: () => Promise<void>;
  claimAdminPassword: (password: string) => Promise<AdminAuthActionResult>;
  loginAdmin: (password: string) => Promise<AdminAuthActionResult>;
  changeAdminPassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<AdminAuthActionResult>;
  logoutAdmin: () => Promise<void>;
  clearAdminError: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

const ADMIN_SESSION_STORAGE_KEY = 'khatanova_admin_session_v1';

function readStoredAdminToken(): string | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    const token = window.sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
    return token && token.trim() ? token : null;
  } catch {
    return null;
  }
}

function writeStoredAdminToken(token: string | null): void {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    if (token) {
      window.sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, token);
    } else {
      window.sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restriction errors
  }
}

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  // Tab-scoped sessionStorage preserves session across refreshes and clears automatically when tab closes
  const [adminToken, setAdminTokenState] = useState<string | null>(() => readStoredAdminToken());
  const setAdminToken = useCallback((token: string | null) => {
    setAdminTokenState(token);
    writeStoredAdminToken(token);
  }, []);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [needsClaim, setNeedsClaim] = useState(false);
  const [envConfigured, setEnvConfigured] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);

  const refreshAdminStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/status', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data = (await res.json()) as AdminStatusResponse;
        setNeedsClaim(Boolean(data.needsClaim));
        setEnvConfigured(Boolean(data.envConfigured));
      }
    } catch {
      // Keep safe defaults if server check temporarily fails
    } finally {
      setStatusLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refreshAdminStatus();
  }, [refreshAdminStatus]);

  useEffect(() => {
    if (!adminToken) return;
    let cancelled = false;
    fetch('/api/admin/session', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        Accept: 'application/json',
      },
    })
      .then((res) => {
        if (!cancelled && !res.ok) {
          setAdminToken(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAdminToken(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [adminToken]);

  useEffect(() => {
    if (retryAfterSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setRetryAfterSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryAfterSeconds]);

  const clearAdminError = useCallback(() => {
    setAdminError(null);
    setRetryAfterSeconds(0);
  }, []);

  const claimAdminPassword = useCallback(async (password: string): Promise<AdminAuthActionResult> => {
    setAdminLoading(true);
    setAdminError(null);
    setRetryAfterSeconds(0);
    try {
      const res = await fetch('/api/admin/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        token?: string;
        error?: string;
      };
      if (!res.ok || !data.token) {
        const errMsg = data.error || 'Could not configure admin password.';
        setAdminError(errMsg);
        if (res.status === 409) {
          setNeedsClaim(false);
        }
        return { ok: false, error: errMsg };
      }
      setAdminToken(data.token);
      setNeedsClaim(false);
      return { ok: true };
    } catch {
      const errMsg = 'Unable to reach admin authentication server.';
      setAdminError(errMsg);
      return { ok: false, error: errMsg };
    } finally {
      setAdminLoading(false);
    }
  }, []);

  const loginAdmin = useCallback(async (password: string): Promise<AdminAuthActionResult> => {
    setAdminLoading(true);
    setAdminError(null);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        token?: string;
        error?: string;
        retryAfterSeconds?: number;
      };
      if (!res.ok || !data.token) {
        const errMsg = data.error || 'Admin login failed.';
        const retry = typeof data.retryAfterSeconds === 'number' ? data.retryAfterSeconds : 0;
        setAdminError(errMsg);
        setRetryAfterSeconds(retry);
        if (res.status === 409) {
          await refreshAdminStatus();
        }
        return { ok: false, error: errMsg, retryAfterSeconds: retry };
      }
      setAdminToken(data.token);
      setRetryAfterSeconds(0);
      return { ok: true };
    } catch {
      const errMsg = 'Unable to reach admin authentication server.';
      setAdminError(errMsg);
      return { ok: false, error: errMsg };
    } finally {
      setAdminLoading(false);
    }
  }, [refreshAdminStatus]);

  const logoutAdmin = useCallback(async () => {
    const token = adminToken;
    setAdminToken(null);
    setAdminError(null);
    setRetryAfterSeconds(0);
    if (!token) return;
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });
    } catch {
      // Token already cleared from React state
    }
  }, [adminToken]);

  const changeAdminPassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<AdminAuthActionResult> => {
      if (!adminToken) {
        return { ok: false, error: 'Admin session has expired. Please log in again.' };
      }
      try {
        const res = await fetch('/api/admin/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({ currentPassword, newPassword }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          token?: string;
          error?: string;
        };
        if (!res.ok || !data.token) {
          return { ok: false, error: data.error || 'Could not update admin password.' };
        }
        setAdminToken(data.token);
        return { ok: true };
      } catch {
        return { ok: false, error: 'Unable to reach admin authentication server.' };
      }
    },
    [adminToken]
  );

  return (
    <AdminAuthContext.Provider
      value={{
        adminToken,
        isAdminAuthenticated: Boolean(adminToken),
        statusLoaded,
        needsClaim,
        envConfigured,
        adminLoading,
        adminError,
        retryAfterSeconds,
        refreshAdminStatus,
        claimAdminPassword,
        loginAdmin,
        changeAdminPassword,
        logoutAdmin,
        clearAdminError,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error('useAdminAuth must be used inside AdminAuthProvider');
  }
  return ctx;
}
