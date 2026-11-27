import crypto from 'node:crypto';

const FIREBASE_PROJECT_ID = 'khatanova-f42f1';
const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

interface CertCache {
  certs: Record<string, string>;
  expiresAtMs: number;
}

let certCache: CertCache | null = null;

function decodeBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64');
}

function parseCacheControlMaxAgeSeconds(headerValue: string | null): number {
  if (!headerValue) return 3600;
  const match = headerValue.match(/max-age=(\d+)/i);
  if (!match) return 3600;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 60 ? seconds : 3600;
}

async function fetchGooglePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (certCache && certCache.expiresAtMs > now) {
    return certCache.certs;
  }

  const res = await fetch(GOOGLE_CERTS_URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error('Unable to fetch Google public keys for token verification.');
  }
  const certs = (await res.json()) as Record<string, string>;
  const maxAgeSec = parseCacheControlMaxAgeSeconds(res.headers.get('cache-control'));
  certCache = {
    certs,
    expiresAtMs: now + maxAgeSec * 1000,
  };
  return certs;
}

export interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  name?: string;
  picture?: string;
}

export interface VerifyTokenOptions {
  projectId?: string;
  certsOverride?: Record<string, string>;
  nowSeconds?: number;
}

export async function verifyFirebaseIdToken(
  token: string,
  options: VerifyTokenOptions = {}
): Promise<VerifiedFirebaseUser> {
  const projectId = options.projectId || FIREBASE_PROJECT_ID;
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid Firebase ID token format.');
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  if (!headerB64 || !payloadB64 || !signatureB64) {
    throw new Error('Invalid Firebase ID token segments.');
  }

  let header: { alg?: string; kid?: string };
  let payload: {
    aud?: string;
    iss?: string;
    sub?: string;
    user_id?: string;
    exp?: number;
    iat?: number;
    email?: string;
    name?: string;
    picture?: string;
  };
  try {
    header = JSON.parse(decodeBase64Url(headerB64).toString('utf8'));
    payload = JSON.parse(decodeBase64Url(payloadB64).toString('utf8'));
  } catch {
    throw new Error('Malformed Firebase ID token payload.');
  }

  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) {
    throw new Error('Unsupported Firebase ID token algorithm or key ID.');
  }

  const certs = options.certsOverride || (await fetchGooglePublicCerts());
  const certPem = certs[header.kid];
  if (!certPem) {
    // Clear cache once in case keys rotated
    if (!options.certsOverride) {
      certCache = null;
      const refreshed = await fetchGooglePublicCerts();
      if (!refreshed[header.kid]) {
        throw new Error('Signing certificate not found for Firebase token.');
      }
      return verifyWithCert(
        `${headerB64}.${payloadB64}`,
        signatureB64,
        refreshed[header.kid],
        payload,
        projectId,
        nowSeconds
      );
    }
    throw new Error('Signing certificate not found for Firebase token.');
  }

  return verifyWithCert(
    `${headerB64}.${payloadB64}`,
    signatureB64,
    certPem,
    payload,
    projectId,
    nowSeconds
  );
}

function verifyWithCert(
  signingInput: string,
  signatureB64: string,
  certOrKeyPem: string,
  payload: {
    aud?: string;
    iss?: string;
    sub?: string;
    user_id?: string;
    exp?: number;
    iat?: number;
    email?: string;
    name?: string;
    picture?: string;
  },
  projectId: string,
  nowSeconds: number
): VerifiedFirebaseUser {
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(signingInput);
  verifier.end();

  const signature = decodeBase64Url(signatureB64);
  if (!verifier.verify(certOrKeyPem, signature)) {
    throw new Error('Invalid Firebase ID token signature.');
  }

  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  const uid = payload.user_id || payload.sub || '';
  if (
    payload.aud !== projectId ||
    payload.iss !== expectedIssuer ||
    !uid ||
    typeof payload.exp !== 'number' ||
    payload.exp <= nowSeconds ||
    typeof payload.iat !== 'number' ||
    payload.iat > nowSeconds + 300
  ) {
    throw new Error('Firebase ID token claims expired or invalid.');
  }

  return {
    uid,
    email: typeof payload.email === 'string' ? payload.email : '',
    ...(typeof payload.name === 'string' ? { name: payload.name } : {}),
    ...(typeof payload.picture === 'string' ? { picture: payload.picture } : {}),
  };
}
