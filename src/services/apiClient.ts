import { auth } from '../firebase/firebase';

const DEFAULT_TIMEOUT_MS = 15000;

async function fetchJsonWithTimeout<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init.headers || {}),
      },
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Request timed out. Please check your connection and try again.');
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function shopApiFetch<T>(
  path: string,
  init: RequestInit = {},
  explicitIdToken?: string
): Promise<T> {
  const token = explicitIdToken || (await auth.currentUser?.getIdToken());
  if (!token) {
    throw new Error('Please sign in with Google first.');
  }
  return fetchJsonWithTimeout<T>(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
}

export async function publicApiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  return fetchJsonWithTimeout<T>(path, init);
}

export async function adminApiFetch<T>(
  path: string,
  adminToken: string | null,
  init: RequestInit = {}
): Promise<T> {
  if (!adminToken) {
    throw new Error('Admin session required. Please unlock the Admin Panel.');
  }
  return fetchJsonWithTimeout<T>(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${adminToken}`,
      ...(init.headers || {}),
    },
  });
}
