import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface StoredAdminCredential {
  salt: string;
  hash: string;
  claimedAt: string;
}

interface AttemptRecord {
  count: number;
  firstAttemptAt: number;
  lockedUntil: number;
}

export interface AdminAuthConfig {
  storePath?: string | null;
  envPasscode?: string;
  sessionSecret?: string;
  maxAttempts?: number;
  lockoutMs?: number;
  sessionTtlMs?: number;
}

export class AdminAuthManager {
  private readonly storePath: string | null;
  private readonly getEnvPasscode: () => string;
  private readonly sessionSecret: string;
  private readonly maxAttempts: number;
  private readonly lockoutMs: number;
  private readonly sessionTtlMs: number;
  private cachedCredential: StoredAdminCredential | null = null;
  private readonly attemptsByIp = new Map<string, AttemptRecord>();
  private readonly revokedTokenIds = new Set<string>();

  constructor(config: AdminAuthConfig = {}) {
    this.storePath = config.storePath === undefined
      ? path.resolve(process.cwd(), '.khatanova-admin.json')
      : config.storePath;
    this.getEnvPasscode = () =>
      (config.envPasscode !== undefined ? config.envPasscode : process.env.ADMIN_PASSCODE || '').trim();
    this.sessionSecret =
      config.sessionSecret ||
      process.env.ADMIN_SESSION_SECRET ||
      crypto.randomBytes(32).toString('hex');
    this.maxAttempts = config.maxAttempts ?? 5;
    this.lockoutMs = config.lockoutMs ?? 15 * 60 * 1000;
    this.sessionTtlMs = config.sessionTtlMs ?? 8 * 60 * 60 * 1000;

    if (this.storePath && fs.existsSync(this.storePath)) {
      try {
        const raw = fs.readFileSync(this.storePath, 'utf8');
        const parsed = JSON.parse(raw) as Partial<StoredAdminCredential>;
        if (
          typeof parsed.salt === 'string' &&
          typeof parsed.hash === 'string' &&
          typeof parsed.claimedAt === 'string'
        ) {
          this.cachedCredential = {
            salt: parsed.salt,
            hash: parsed.hash,
            claimedAt: parsed.claimedAt,
          };
        }
      } catch {
        this.cachedCredential = null;
      }
    }
  }

  public getStatus(): { envConfigured: boolean; claimed: boolean; needsClaim: boolean } {
    const envConfigured = this.getEnvPasscode().length > 0;
    const claimed = this.cachedCredential !== null;
    return {
      envConfigured,
      claimed,
      needsClaim: !envConfigured && !claimed,
    };
  }

  private hashPassword(password: string, saltHex: string): Buffer {
    return crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
  }

  public claimPasscode(password: string): { ok: true; token: string; expiresAt: number } | { ok: false; status: number; error: string } {
    const status = this.getStatus();
    if (!status.needsClaim) {
      return {
        ok: false,
        status: 409,
        error: 'Admin passcode is already configured and locked.',
      };
    }

    const trimmed = password.trim();
    if (trimmed.length < 6 || trimmed.length > 128) {
      return {
        ok: false,
        status: 400,
        error: 'Admin password must be between 6 and 128 characters.',
      };
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = this.hashPassword(trimmed, salt).toString('hex');
    const credential: StoredAdminCredential = {
      salt,
      hash,
      claimedAt: new Date().toISOString(),
    };

    if (this.storePath) {
      fs.writeFileSync(this.storePath, JSON.stringify(credential, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });
    }
    this.cachedCredential = credential;
    const session = this.issueToken();
    return { ok: true, ...session };
  }

  public verifyLogin(
    password: string,
    clientKey: string,
    nowMs = Date.now()
  ): { ok: true; token: string; expiresAt: number } | { ok: false; status: number; error: string; retryAfterSeconds?: number } {
    const existing = this.attemptsByIp.get(clientKey);
    if (existing && existing.lockedUntil > nowMs) {
      const retryAfterSeconds = Math.ceil((existing.lockedUntil - nowMs) / 1000);
      return {
        ok: false,
        status: 429,
        retryAfterSeconds,
        error: `Too many failed attempts. Try again in ${retryAfterSeconds} seconds.`,
      };
    }

    const status = this.getStatus();
    if (status.needsClaim) {
      return {
        ok: false,
        status: 409,
        error: 'Admin password has not been claimed yet.',
      };
    }

    const candidate = password.trim();
    if (!candidate) {
      return {
        ok: false,
        status: 400,
        error: 'Password is required.',
      };
    }

    let matched = false;
    const envPasscode = this.getEnvPasscode();
    if (envPasscode.length > 0) {
      // Env passcode always overrides any claimed fallback hash
      const a = crypto.createHash('sha256').update(candidate).digest();
      const b = crypto.createHash('sha256').update(envPasscode).digest();
      matched = crypto.timingSafeEqual(a, b);
    } else if (this.cachedCredential) {
      const derived = this.hashPassword(candidate, this.cachedCredential.salt);
      const expected = Buffer.from(this.cachedCredential.hash, 'hex');
      matched = derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
    }

    if (!matched) {
      const nextCount =
        existing && nowMs - existing.firstAttemptAt <= this.lockoutMs ? existing.count + 1 : 1;
      const firstAttemptAt =
        existing && nowMs - existing.firstAttemptAt <= this.lockoutMs ? existing.firstAttemptAt : nowMs;
      const lockedUntil = nextCount >= this.maxAttempts ? nowMs + this.lockoutMs : 0;

      this.attemptsByIp.set(clientKey, { count: nextCount, firstAttemptAt, lockedUntil });

      if (lockedUntil > nowMs) {
        const retryAfterSeconds = Math.ceil((lockedUntil - nowMs) / 1000);
        return {
          ok: false,
          status: 429,
          retryAfterSeconds,
          error: `Too many failed attempts. Locked for ${Math.ceil(retryAfterSeconds / 60)} minutes.`,
        };
      }

      return {
        ok: false,
        status: 401,
        error: 'Incorrect admin password.',
      };
    }

    this.attemptsByIp.delete(clientKey);
    const session = this.issueToken(nowMs);
    return { ok: true, ...session };
  }

  private issueToken(nowMs = Date.now()): { token: string; expiresAt: number } {
    const expiresAt = nowMs + this.sessionTtlMs;
    const jti = crypto.randomBytes(16).toString('hex');
    const payload = Buffer.from(JSON.stringify({ role: 'admin', jti, exp: expiresAt })).toString('base64url');
    const sig = crypto
      .createHmac('sha256', this.sessionSecret)
      .update(payload)
      .digest('base64url');
    return { token: `${payload}.${sig}`, expiresAt };
  }

  public verifyToken(token: string, nowMs = Date.now()): { valid: true; jti: string; expiresAt: number } | { valid: false } {
    const parts = token.split('.');
    if (parts.length !== 2) return { valid: false };
    const [payloadB64, sigB64] = parts;
    if (!payloadB64 || !sigB64) return { valid: false };

    const expectedSig = crypto
      .createHmac('sha256', this.sessionSecret)
      .update(payloadB64)
      .digest();
    let providedSig: Buffer;
    try {
      providedSig = Buffer.from(sigB64, 'base64url');
    } catch {
      return { valid: false };
    }

    if (
      providedSig.length !== expectedSig.length ||
      !crypto.timingSafeEqual(providedSig, expectedSig)
    ) {
      return { valid: false };
    }

    try {
      const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
        role?: string;
        jti?: string;
        exp?: number;
      };
      if (
        parsed.role !== 'admin' ||
        typeof parsed.jti !== 'string' ||
        typeof parsed.exp !== 'number' ||
        parsed.exp <= nowMs ||
        this.revokedTokenIds.has(parsed.jti)
      ) {
        return { valid: false };
      }
      return { valid: true, jti: parsed.jti, expiresAt: parsed.exp };
    } catch {
      return { valid: false };
    }
  }

  public revokeToken(token: string): void {
    const res = this.verifyToken(token);
    if (res.valid) {
      this.revokedTokenIds.add(res.jti);
    }
  }

  public changePasscode(
    currentPassword: string,
    newPassword: string
  ): { ok: true; token: string; expiresAt: number } | { ok: false; status: number; error: string } {
    const status = this.getStatus();
    if (status.envConfigured) {
      return {
        ok: false,
        status: 409,
        error:
          'Admin passcode is currently managed by the ADMIN_PASSCODE environment secret. Update it in AI Studio Settings → Secrets.',
      };
    }
    if (status.needsClaim || !this.cachedCredential) {
      return {
        ok: false,
        status: 409,
        error: 'Admin passcode has not been claimed yet.',
      };
    }

    const currentTrimmed = currentPassword.trim();
    const nextTrimmed = newPassword.trim();
    if (!currentTrimmed) {
      return {
        ok: false,
        status: 400,
        error: 'Current admin password is required.',
      };
    }
    if (nextTrimmed.length < 6 || nextTrimmed.length > 128) {
      return {
        ok: false,
        status: 400,
        error: 'New admin password must be between 6 and 128 characters.',
      };
    }

    const derived = this.hashPassword(currentTrimmed, this.cachedCredential.salt);
    const expected = Buffer.from(this.cachedCredential.hash, 'hex');
    const matched =
      derived.length === expected.length && crypto.timingSafeEqual(derived, expected);

    if (!matched) {
      return {
        ok: false,
        status: 401,
        error: 'Current admin password is incorrect.',
      };
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = this.hashPassword(nextTrimmed, salt).toString('hex');
    const credential: StoredAdminCredential = {
      salt,
      hash,
      claimedAt: new Date().toISOString(),
    };

    if (this.storePath) {
      const tmpPath = `${this.storePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(credential, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });
      fs.renameSync(tmpPath, this.storePath);
    }

    this.cachedCredential = credential;
    const session = this.issueToken();
    return { ok: true, ...session };
  }
}
