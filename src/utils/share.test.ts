import test from 'node:test';
import assert from 'node:assert/strict';
import type { Sale } from '../types/models';
import {
  buildCustomerWhatsAppReminderMessage,
  buildPaymentWhatsAppMessage,
  buildSaleWhatsAppMessage,
  buildWhatsAppShareUrl,
  calculateThermalReceiptHeightMm,
  formatPdfInr,
  normalizeIndianPhoneForWhatsApp,
} from './share';

const sampleSale: Sale = {
  id: 'sale-1',
  invoiceId: 'INV-1001',
  shopId: 'shop-1',
  customerId: 'cust-1',
  customerName: 'Vinay Sharma',
  items: [
    { id: '1', name: 'Chini', quantity: 2, unit: 'pcs', unitPrice: 45, lineTotal: 90 },
    { id: '2', name: 'Atta', quantity: 1, unit: 'pcs', unitPrice: 320, lineTotal: 320 },
  ],
  subtotal: 410,
  discount: 10,
  finalTotal: 400,
  paymentMethod: 'udhaar',
  paidAmount: 0,
  dueAmount: 400,
  status: 'completed',
  createdByUid: 'uid-1',
  createdAt: '2026-11-23T10:00:00.000Z',
  updatedAt: '2026-11-23T10:00:00.000Z',
};

test('formatPdfInr uses ASCII Rs. prefix without unsupported rupee glyph', () => {
  assert.equal(formatPdfInr(1250), 'Rs. 1,250');
  assert.equal(formatPdfInr(49.5), 'Rs. 49.50');
});

test('normalizeIndianPhoneForWhatsApp normalizes 10-digit and 0-prefixed mobile numbers', () => {
  assert.equal(normalizeIndianPhoneForWhatsApp('8757209126'), '918757209126');
  assert.equal(normalizeIndianPhoneForWhatsApp('087572-09126'), '918757209126');
  assert.equal(normalizeIndianPhoneForWhatsApp('+91 87572 09126'), '918757209126');
  assert.equal(normalizeIndianPhoneForWhatsApp('12345'), '');
});

test('buildSaleWhatsAppMessage formats itemized Hindi and English written receipts accurately', () => {
  const hiMsg = buildSaleWhatsAppMessage('Chit Dukan', sampleSale, 'hi', {
    phoneNumber: '9988776655',
    address: 'Main Market',
  });
  assert.match(hiMsg, /\*Chit Dukan\*/);
  assert.match(hiMsg, /Main Market/);
  assert.match(hiMsg, /INV-1001/);
  assert.match(hiMsg, /Vinay Sharma/);
  assert.match(hiMsg, /Chini \(2 pcs × ₹45\) = ₹90/);
  assert.match(hiMsg, /कुल राशि: ₹400/);
  assert.match(hiMsg, /बकाया \(उधार\): ₹400/);
  assert.doesNotMatch(hiMsg, /जमा राशि/);

  const customQtySale: Sale = {
    ...sampleSale,
    items: [
      {
        id: '1',
        name: 'Sugar',
        quantity: 1,
        quantityLabel: 'आधा किलो',
        unit: 'kg',
        unitPrice: 25,
        lineTotal: 25,
      },
    ],
  };
  const customMsg = buildSaleWhatsAppMessage('Chit Dukan', customQtySale, 'hi');
  assert.match(customMsg, /Sugar \(आधा किलो kg × ₹25\) = ₹25/);

  const enMsg = buildSaleWhatsAppMessage('Chit Dukan', sampleSale, 'en');
  assert.match(enMsg, /Final Total: ₹400/);
  assert.match(enMsg, /Balance Due: ₹400/);
  assert.doesNotMatch(enMsg, /\nPaid:/);
});

test('buildPaymentWhatsAppMessage formats Udhaar payment deposit receipts in Hindi and English', () => {
  const hiPayMsg = buildPaymentWhatsAppMessage({
    shopName: 'Chit Dukan',
    shopPhone: '9988776655',
    customerName: 'Ramesh Verma',
    customerPhone: '9123456789',
    receiptId: 'RCP-5001',
    amountPaid: 250,
    paymentMethod: 'upi',
    paymentDate: '2026-11-23T11:30:00.000Z',
    remainingBalance: 150,
    language: 'hi',
  });
  assert.match(hiPayMsg, /पेमेंट जमा रसीद/);
  assert.match(hiPayMsg, /RCP-5001/);
  assert.match(hiPayMsg, /Ramesh Verma/);
  assert.match(hiPayMsg, /जमा राशि: ₹250/);
  assert.match(hiPayMsg, /बाकी उधार राशि: ₹150/);

  const settledEnMsg = buildPaymentWhatsAppMessage({
    shopName: 'Chit Dukan',
    customerName: 'Ramesh Verma',
    receiptId: 'RCP-5002',
    amountPaid: 150,
    paymentMethod: 'cash',
    paymentDate: '2026-11-23T12:00:00.000Z',
    remainingBalance: 0,
    language: 'en',
  });
  assert.match(settledEnMsg, /Amount Paid: ₹150/);
  assert.match(settledEnMsg, /Settled/);
});

test('buildCustomerWhatsAppReminderMessage includes only required fields in Hindi with direct date and trailing धन्यवाद!', () => {
  const msg = buildCustomerWhatsAppReminderMessage({
    shopName: 'Shree Ganesh Kirana',
    shopAddress: 'Main Bazar, Daltonganj',
    shopPhone: '9876543210',
    customerName: 'Ramesh Kumar',
    outstandingBalance: 1450,
    currentDate: new Date('2026-11-24T09:00:00.000Z'),
  });

  assert.match(msg, /\*Shree Ganesh Kirana\*/);
  assert.match(msg, /Main Bazar, Daltonganj/);
  assert.match(msg, /फ़ोन: 9876543210/);
  assert.match(msg, /24 Nov 2026/);
  assert.match(msg, /ग्राहक: Ramesh Kumar/);
  assert.match(msg, /\*बकाया राशि: ₹1,450\*/);
  assert.match(msg, /कृपया आप अपना बकाया पैसा जल्द से जल्द दुकान पर जमा कर दें।/);
  assert.equal(msg.trimEnd().endsWith('धन्यवाद!'), true);

  // Must NOT include "Date", "Message Date", "तारीख", or extra ledger stats
  assert.doesNotMatch(msg, /Message Date/i);
  assert.doesNotMatch(msg, /\bDate\b/i);
  assert.doesNotMatch(msg, /तारीख/);
  assert.doesNotMatch(msg, /कुल उधार|कुल जमा|Total Credit|Total Paid/);

  const url = buildWhatsAppShareUrl(msg, '8757209126');
  assert.equal(url.startsWith('https://wa.me/918757209126?text='), true);
  assert.equal(decodeURIComponent(url.split('?text=')[1]), msg);
});

test('buildWhatsAppShareUrl targets customer mobile when available and generic wa.me otherwise', () => {
  const urlWithPhone = buildWhatsAppShareUrl('Hello Bill', '8757209126');
  assert.equal(urlWithPhone, 'https://wa.me/918757209126?text=Hello%20Bill');

  const genericUrl = buildWhatsAppShareUrl('Hello Bill');
  assert.equal(genericUrl, 'https://wa.me/?text=Hello%20Bill');
});

test('calculateThermalReceiptHeightMm scales receipt height with item count and optional rows', () => {
  const minHeight = calculateThermalReceiptHeightMm({ itemCount: 1 });
  const tallerHeight = calculateThermalReceiptHeightMm({
    itemCount: 10,
    hasDiscount: true,
    hasGst: true,
    hasCustomerPhone: true,
  });
  assert.equal(minHeight >= 138, true);
  assert.equal(tallerHeight > minHeight, true);
});
