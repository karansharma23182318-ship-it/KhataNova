import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLockedUpiPaymentUri,
  extractUpiIdFromQrPayload,
  formatLockedUpiAmount,
  generateUpiQrMatrix,
  hasShopPaymentScannerConfigured,
  isValidUpiId,
  normalizeUpiId,
} from './upiScanner';

test('normalizeUpiId and isValidUpiId validate PhonePe/GPay/Paytm UPI handles', () => {
  assert.equal(normalizeUpiId('  8757209126@YBL '), '8757209126@ybl');
  assert.equal(isValidUpiId('8757209126@ybl'), true);
  assert.equal(isValidUpiId('chit.dukan-01@okicici'), true);
  assert.equal(isValidUpiId('invalid upi@ybl'), false);
  assert.equal(isValidUpiId('missinghandle'), false);
  assert.equal(isValidUpiId('@ybl'), false);
});

test('extractUpiIdFromQrPayload parses UPI URI payloads from uploaded gallery QR codes', () => {
  assert.equal(
    extractUpiIdFromQrPayload(
      'upi://pay?pa=8757209126@ybl&pn=Chit%20Dukan&mc=0000&mode=02&purpose=00'
    ),
    '8757209126@ybl'
  );
  assert.equal(extractUpiIdFromQrPayload('shopkeeper@paytm'), 'shopkeeper@paytm');
  assert.equal(extractUpiIdFromQrPayload('https://example.com/not-upi'), null);
});

test('buildLockedUpiPaymentUri encodes exact bill amount (e.g. Rs 15, Rs 100) without allowing edits', () => {
  const uri15 = buildLockedUpiPaymentUri({
    upiId: '8757209126@ybl',
    shopName: 'CHIT DUKAN',
    amount: 15,
    invoiceId: 'INV-20261124-ABC123',
  });
  assert.ok(uri15);
  const parsed15 = new URL(uri15.replace(/^upi:\/\//, 'https://'));
  assert.equal(parsed15.searchParams.get('pa'), '8757209126@ybl');
  assert.equal(parsed15.searchParams.get('pn'), 'CHIT DUKAN');
  assert.equal(parsed15.searchParams.get('am'), '15.00');
  assert.equal(parsed15.searchParams.get('cu'), 'INR');
  assert.equal(parsed15.searchParams.get('tn'), 'Bill INV-20261124-ABC123');

  const uri100 = buildLockedUpiPaymentUri({
    upiId: 'shop@okaxis',
    shopName: 'Ramesh Kirana',
    amount: 100.5,
  });
  assert.ok(uri100);
  const parsed100 = new URL(uri100.replace(/^upi:\/\//, 'https://'));
  assert.equal(parsed100.searchParams.get('am'), '100.50');

  assert.equal(formatLockedUpiAmount(0), null);
  assert.equal(
    buildLockedUpiPaymentUri({ upiId: '8757209126@ybl', shopName: 'Shop', amount: 0 }),
    null
  );
  assert.equal(
    buildLockedUpiPaymentUri({ upiId: 'bad-handle', shopName: 'Shop', amount: 20 }),
    null
  );
});

test('generateUpiQrMatrix encodes a valid scannable square matrix for NPCI UPI URIs', () => {
  const uri = buildLockedUpiPaymentUri({
    upiId: '8757209126@ybl',
    shopName: 'CHIT DUKAN',
    amount: 20,
    invoiceId: 'INV-001',
  });
  assert.ok(uri);
  const qr = generateUpiQrMatrix(uri);
  assert.ok(qr.size >= 21);
  assert.equal(qr.modules.length, qr.size);
  assert.equal(qr.modules[0].length, qr.size);
  // Top-left finder pattern corner must be dark (true)
  assert.equal(qr.modules[0][0], true);
});

test('hasShopPaymentScannerConfigured checks valid saved UPI ID cleanly', () => {
  assert.equal(hasShopPaymentScannerConfigured(null), false);
  assert.equal(hasShopPaymentScannerConfigured({ paymentQrUrl: 'data:image/png;base64,abc' }), false);
  assert.equal(
    hasShopPaymentScannerConfigured({
      paymentUpiId: '8757209126@ybl',
      paymentQrUrl: 'data:image/png;base64,abc',
    }),
    true
  );
});
