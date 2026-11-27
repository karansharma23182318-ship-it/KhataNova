import * as ZXingLib from '@zxing/library';
import type { ShopProfile } from '../types/models';

const zxingResolved = ((ZXingLib as unknown as { default?: typeof ZXingLib }).default ||
  ZXingLib) as typeof ZXingLib;

export interface UpiPaymentQrInput {
  upiId: string;
  shopName: string;
  amount: number;
  invoiceId?: string;
}

export interface QrMatrixData {
  size: number;
  modules: boolean[][];
}

const UPI_ID_REGEX = /^[a-z0-9][a-z0-9._-]{1,63}@[a-z0-9]{2,32}$/i;

export function normalizeUpiId(raw: string | undefined | null): string {
  return String(raw || '').trim().toLowerCase();
}

export function isValidUpiId(raw: string | undefined | null): boolean {
  const normalized = normalizeUpiId(raw);
  if (!normalized || normalized.length > 100) return false;
  return UPI_ID_REGEX.test(normalized);
}

/**
 * Extracts a UPI ID (`pa=...`) when decoding an uploaded PhonePe/GPay/Paytm QR payload.
 */
export function extractUpiIdFromQrPayload(payload: string | undefined | null): string | null {
  const text = String(payload || '').trim();
  if (!text) return null;

  if (/^upi:\/\/pay/i.test(text)) {
    try {
      const normalizedUrl = text.replace(/^upi:\/\//i, 'https://');
      const url = new URL(normalizedUrl);
      const pa = normalizeUpiId(url.searchParams.get('pa'));
      return isValidUpiId(pa) ? pa : null;
    } catch {
      // Fallback regex below
    }
  }

  const match = text.match(/[?&]pa=([^&\s]+)/i);
  if (match && match[1]) {
    try {
      const decoded = normalizeUpiId(decodeURIComponent(match[1]));
      return isValidUpiId(decoded) ? decoded : null;
    } catch {
      const rawPa = normalizeUpiId(match[1]);
      return isValidUpiId(rawPa) ? rawPa : null;
    }
  }

  if (isValidUpiId(text)) {
    return normalizeUpiId(text);
  }

  return null;
}

/**
 * Returns true if the shopkeeper has configured a valid UPI ID (and optional gallery QR)
 * needed to generate real amount-locked UPI payment scanners.
 */
export function hasShopPaymentScannerConfigured(
  shopProfile: Pick<ShopProfile, 'paymentUpiId' | 'paymentQrUrl'> | null | undefined
): boolean {
  if (!shopProfile) return false;
  return isValidUpiId(shopProfile.paymentUpiId);
}

/**
 * Formats an exact bill amount for NPCI UPI QR URIs so apps display & lock the exact rupee value.
 */
export function formatLockedUpiAmount(amount: number): string | null {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const rounded = Math.round(numeric * 100) / 100;
  if (rounded <= 0) return null;
  return rounded.toFixed(2);
}

/**
 * Builds an NPCI-compliant UPI payment URI with a locked exact bill amount (`am`).
 */
export function buildLockedUpiPaymentUri(input: UpiPaymentQrInput): string | null {
  const pa = normalizeUpiId(input.upiId);
  if (!isValidUpiId(pa)) return null;

  const am = formatLockedUpiAmount(input.amount);
  if (!am) return null;

  const pn = String(input.shopName || 'KhataNova Shop')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 60);

  const invoiceRef = String(input.invoiceId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 35);

  const tn = invoiceRef ? `Bill ${invoiceRef}` : 'Bill Payment';

  const params = new URLSearchParams();
  params.set('pa', pa);
  params.set('pn', pn || 'Shop');
  params.set('am', am);
  params.set('cu', 'INR');
  params.set('tn', tn);

  return `upi://pay?${params.toString()}`;
}

/**
 * Encodes a UPI payment URI into a deterministic scannable QR matrix using @zxing/library.
 */
export function generateUpiQrMatrix(upiUri: string): QrMatrixData {
  const clean = String(upiUri || '').trim();
  if (!clean) {
    throw new Error('Cannot generate QR code from empty UPI URI.');
  }
  const hints = new Map<ZXingLib.EncodeHintType, unknown>();
  hints.set(zxingResolved.EncodeHintType.CHARACTER_SET, 'UTF-8');
  hints.set(zxingResolved.EncodeHintType.MARGIN, 1);

  const qr = zxingResolved.QRCodeEncoder.encode(
    clean,
    zxingResolved.QRCodeDecoderErrorCorrectionLevel.M,
    hints
  );
  const matrix = qr.getMatrix();
  const width = matrix.getWidth();
  const height = matrix.getHeight();
  const size = Math.max(width, height);
  const modules: boolean[][] = [];

  for (let y = 0; y < height; y += 1) {
    const row: boolean[] = [];
    for (let x = 0; x < width; x += 1) {
      row.push(matrix.get(x, y) === 1);
    }
    modules.push(row);
  }

  return { size, modules };
}
